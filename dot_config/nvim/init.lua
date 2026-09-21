-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local out = vim.fn.system({
    "git", "clone", "--filter=blob:none", "--branch=stable",
    "https://github.com/folke/lazy.nvim.git", lazypath,
  })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

vim.opt.showcmd = true
vim.opt.showmode = false
vim.opt.incsearch = true
vim.opt.hlsearch = true
vim.opt.wrap = true
vim.opt.linebreak = true
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true
vim.opt.number = true
vim.opt.signcolumn = "yes"
vim.opt.clipboard = "unnamedplus"
if vim.env.HERDR_ENV == "1" and vim.fn.executable("pbcopy") == 0 then
  -- On a local herdr pane, pbcopy/pbpaste talk to the real macOS clipboard
  -- directly and just work, so leave nvim's default clipboard provider in
  -- place. Only remote/containerized herdr targets lack pbcopy/xclip; there,
  -- fall back to OSC 52, which herdr relays to the host clipboard.
  --
  -- Write-only, deliberately. OSC 52 paste queries the terminal for the
  -- clipboard and blocks on the reply, but herdr's pty relay never returns
  -- one, so a put would hang on "Waiting for OSC 52 response from the
  -- terminal." Instead, paste returns nvim's own unnamed register: a
  -- yank-then-put round-trips inside nvim without touching the terminal. The
  -- tradeoff is that you can't pull text copied in another host app into nvim
  -- via "+ on these targets, but that path was already unreliable.
  local osc52 = require("vim.ui.clipboard.osc52")
  local paste_from_reg = function()
    return { vim.fn.split(vim.fn.getreg('"'), "\n"), vim.fn.getregtype('"') }
  end
  vim.g.clipboard = {
    name = "OSC 52",
    copy = {
      ["+"] = osc52.copy("+"),
      ["*"] = osc52.copy("*"),
    },
    paste = {
      ["+"] = paste_from_reg,
      ["*"] = paste_from_reg,
    },
  }
end
vim.opt.scrolloff = 8
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.undofile = true
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.opt.confirm = true
vim.opt.cursorline = true
vim.opt.breakindent = true
vim.opt.updatetime = 250
vim.opt.timeoutlen = 300
vim.opt.pumheight = 10
vim.opt.winborder = "rounded"

-- Markdown link following. marksman answers a reference label's definition
-- with the [label]: line, which is correct LSP -- the label is what the usage
-- refers to -- but a hop short of useful: from the body you want the
-- document, not the place the link was declared. It implements no
-- documentLink either, so nothing in the protocol closes that gap, and on the
-- [label]: line itself the jump falls through to Vim's tags-file search and
-- dies with E433.
--
-- Filling that in through 'tagfunc' rather than a keymap is what makes it
-- cover the mouse: <C-]>, <C-LeftMouse> and the tag stack (<C-t> to come
-- back) all route through tagfunc, so one function serves keyboard and mouse
-- alike with nothing rebound.
--
-- [[wiki]] links delegate to marksman, which resolves those by title across
-- the project -- knowledge this has no way to reproduce. Everything else
-- resolves here, because marksman answers only with the cursor on a link's
-- text, and a click lands wherever it lands.
--
-- MarkdownTagfunc has to be a global: 'tagfunc' takes a name to look up, not
-- a closure.

-- The reference label under the cursor, in any of markdown's forms: [label],
-- [text][label], [label][], and the [label]: definition line itself -- where
-- there is no label to chase because the target is already in hand, so it
-- comes back as the second value. Returns nothing for the link styles
-- marksman gets right on its own.
local function md_label_at_cursor(line, col)
  for s, group in line:gmatch("()(%b[])") do
    local e = s + #group - 1
    local rest = line:sub(e + 1)
    -- An inline link's span runs to the closing paren, so the target, a
    -- "Title" and the punctuation between them are all live, not just the
    -- bracketed text. %b() nests, so a URL ending in (parens) survives.
    local parens = rest:match("^(%b())")
    if col >= s and col <= (parens and e + #parens or e) then
      local inner = group:sub(2, -2)
      if inner:match("^%[.*%]$") then return nil end -- [[wiki]]
      if parens then -- [text](target)
        -- Read the target out of the balanced parens rather than stopping at
        -- the first ")", or a URL that ends in one loses it. A trailing
        -- "Title" is not part of the target; a space inside one requires <>.
        local body = parens:sub(2, -2):gsub('%s+["\'(].*$', "")
        return nil, body:match("^%s*<([^>]*)>") or body:match("^%s*(%S+)")
      end
      if rest:match("^:") then return nil, rest:match("^:%s*(%S+)") end
      local second = rest:match("^%[([^%[%]]*)%]")
      if second and second ~= "" then return second end -- [text][label]
      return inner -- [label] and [label][]
    end
  end
  -- Cursor on a [label]: line's target rather than on its label.
  return nil, line:match("^%s*%[[^%]]+%]:%s*(%S+)")
end

-- A URL under the cursor belonging to no link markup: an <autolink>, or one
-- written bare in prose. Trailing sentence punctuation is not part of it.
local function md_url_at_cursor(line, col)
  for _, pattern in ipairs({ "()(%a[%w+.-]*://[^%s<>()%[%]\"']+)", "()(mailto:[^%s<>()%[%]\"']+)" }) do
    for s, url in line:gmatch(pattern) do
      url = url:gsub("[%.,;:!?]+$", "")
      if col >= s and col <= s + #url - 1 then return url end
    end
  end
end

-- What a [label]: definition points at. Labels are case-insensitive.
local function md_definition_target(buf, label)
  local want = label:lower()
  for _, l in ipairs(vim.api.nvim_buf_get_lines(buf, 0, -1, false)) do
    local lbl, target = l:match("^%s*%[([^%]]+)%]:%s*(%S+)")
    if lbl and lbl:lower() == want then
      return (target:gsub("^<(.*)>$", "%1"))
    end
  end
end

-- The line of the heading an #anchor names, slugified the way GitHub and
-- marksman do it. Answering with a line number rather than a search pattern
-- keeps Vim out of it: a tag pattern that misses fails the whole jump with
-- E434, where a number that misses still lands in the right file.
local function md_heading_line(path, anchor)
  local want = anchor:lower():gsub("[^%w%s-]", ""):gsub("%s+", "-")
  local ok, lines = pcall(vim.fn.readfile, path)
  if not ok then return 1 end
  for i, l in ipairs(lines) do
    local heading = l:match("^#+%s+(.*)$")
    if heading and heading:lower():gsub("[^%w%s-]", ""):gsub("%s+", "-") == want then
      return i
    end
  end
  return 1
end

local function md_tag_for(buf, target)
  -- A URL has no file to jump to, so hand it to the browser and stand still.
  -- Returning a tag at the cursor keeps the jump a no-op instead of an E426.
  if target:match("^%a[%w+.-]*:") then
    vim.ui.open(target)
    return { {
      name = target,
      filename = vim.api.nvim_buf_get_name(buf),
      cmd = tostring(vim.fn.line(".")),
    } }
  end
  local path, anchor = target:match("^([^#]*)#?(.*)$")
  if path == "" then
    path = vim.api.nvim_buf_get_name(buf) -- a bare #anchor is this file
  else
    path = vim.fs.normalize(path)
    if not path:match("^[/~]") then
      path = vim.fs.joinpath(vim.fs.dirname(vim.api.nvim_buf_get_name(buf)), path)
    end
    path = vim.fs.normalize(path)
  end
  return { {
    name = target,
    filename = path,
    cmd = tostring(anchor ~= "" and md_heading_line(path, anchor) or 1),
  } }
end

function _G.MarkdownTagfunc(pattern, flags, info)
  -- "c" means the cursor is the context, which is the only case where a link
  -- is what we are looking at; a bare :tag lookup delegates like anything else.
  if flags:find("c") then
    local buf = vim.api.nvim_get_current_buf()
    local line, col = vim.api.nvim_get_current_line(), vim.fn.col(".")
    local label, target = md_label_at_cursor(line, col)
    target = target
      or (label and md_definition_target(buf, label))
      or md_url_at_cursor(line, col)
    if target then return md_tag_for(buf, target) end
  end
  local ok, res = pcall(vim.lsp.tagfunc, pattern, flags, info)
  return ok and res or nil
end

-- Markdown: disable concealment so syntax is visible as typed, and follow
-- links as above. Claiming tagfunc here rather than on LspAttach is
-- deliberate -- vim.lsp only sets it when it is still empty or default, so
-- setting it first is what stops marksman from taking it back.
vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function(args)
    vim.opt_local.conceallevel = 0
    vim.bo[args.buf].tagfunc = "v:lua.MarkdownTagfunc"
  end,
})

vim.diagnostic.config({
  virtual_text = true,
  severity_sort = true,
})

-- The popup menu (right-click, completion) can't take a border; lift its
-- background instead so it stands apart from the editor.
vim.api.nvim_create_autocmd("ColorScheme", {
  callback = function()
    vim.api.nvim_set_hl(0, "Pmenu", { bg = "#2a2e45" })
    vim.api.nvim_set_hl(0, "PmenuSel", { bg = "#3d59a1", bold = true })
  end,
})

-- Let ty own hover (K); ruff's hover is just diagnostic text.
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    if client and client.name == "ruff" then
      client.server_capabilities.hoverProvider = false
    end
  end,
})

-- Herdr names a pane only when it recognizes a coding agent inside it, so an
-- nvim split shows a blank border. Label it "nvim" for the session, and hand
-- the border back on exit. Labeling from here rather than from a shell hook
-- also covers nvim opened as $EDITOR and nvim resumed after ctrl-z.
local herdr_pane = vim.env.HERDR_PANE_ID
if herdr_pane and herdr_pane ~= "" and vim.fn.executable("herdr") == 1 then
  vim.api.nvim_create_autocmd("VimEnter", {
    callback = function()
      vim.system({ "herdr", "pane", "rename", herdr_pane, "nvim" })
    end,
  })

  vim.api.nvim_create_autocmd("VimLeavePre", {
    callback = function()
      -- nvim would otherwise exit before the rename reaches herdr's socket.
      vim.system({ "herdr", "pane", "rename", herdr_pane, "--clear" }):wait(500)
    end,
  })
end

vim.keymap.set("n", "<leader>th", function()
  Snacks.terminal.toggle(nil, { win = { position = "bottom" } })
end, { desc = "Toggle horizontal terminal" })
vim.keymap.set({ "n", "t" }, "<C-\\>", function()
  Snacks.terminal.toggle(nil, { win = { position = "float", border = "rounded" } })
end, { desc = "Toggle floating terminal" })

vim.keymap.set("n", "<leader>ff", function() Snacks.picker.files() end, { desc = "Find files" })
vim.keymap.set("n", "<leader>fg", function() Snacks.picker.grep() end, { desc = "Grep" })
vim.keymap.set("n", "<leader>fb", function() Snacks.picker.buffers() end, { desc = "Buffers" })
vim.keymap.set("n", "<leader>fr", function() Snacks.picker.recent() end, { desc = "Recent files" })
vim.keymap.set("n", "<leader>fh", function() Snacks.picker.help() end, { desc = "Help tags" })
vim.keymap.set("n", "<leader>f/", function() Snacks.picker.lines() end, { desc = "Search in buffer" })
vim.keymap.set("n", "<leader>fd", function() Snacks.picker.diagnostics() end, { desc = "Diagnostics" })
vim.keymap.set("n", "<leader>fk", function() Snacks.picker.keymaps() end, { desc = "Keymaps" })
vim.keymap.set("n", "<leader>fR", function() Snacks.picker.resume() end, { desc = "Resume picker" })

vim.keymap.set("n", "<leader>e", function() Snacks.explorer() end, { desc = "File explorer" })

vim.keymap.set("n", "<S-h>", "<cmd>BufferLineCyclePrev<cr>", { desc = "Previous buffer" })
vim.keymap.set("n", "<S-l>", "<cmd>BufferLineCycleNext<cr>", { desc = "Next buffer" })
vim.keymap.set("n", "<leader>bd", function() Snacks.bufdelete() end, { desc = "Delete buffer" })
vim.keymap.set("n", "<leader>bo", function() Snacks.bufdelete.other() end, { desc = "Delete other buffers" })
vim.keymap.set("n", "<leader>bp", "<cmd>BufferLineTogglePin<cr>", { desc = "Pin buffer" })

vim.keymap.set({ "n", "i", "v", "c" }, "<D-s>", "<Cmd>w<CR>", { desc = "Save file" })
vim.keymap.set("v", "<D-c>", "y", { desc = "Copy to system clipboard" })
vim.keymap.set("i", "<D-c>", "<Nop>", { desc = "Swallow Cmd-C in insert" })

vim.keymap.set("n", "<C-h>", "<C-w>h")
vim.keymap.set("n", "<C-j>", "<C-w>j")
vim.keymap.set("n", "<C-k>", "<C-w>k")
vim.keymap.set("n", "<C-l>", "<C-w>l")
vim.keymap.set("t", "<C-h>", "<C-\\><C-n><C-w>h")
vim.keymap.set("t", "<C-j>", "<C-\\><C-n><C-w>j")
vim.keymap.set("t", "<C-k>", "<C-\\><C-n><C-w>k")
vim.keymap.set("t", "<C-l>", "<C-\\><C-n><C-w>l")

require("lazy").setup({
  {
    "folke/tokyonight.nvim",
    priority = 1000,
    lazy = false,
    opts = { style = "night" },
    config = function(_, opts)
      require("tokyonight").setup(opts)
      vim.cmd.colorscheme("tokyonight")
    end,
  },
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    lazy = false,
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter").install({
        "bash", "lua", "luadoc", "markdown", "markdown_inline",
        "python", "query", "vim", "vimdoc",
      })

      vim.api.nvim_create_autocmd("FileType", {
        callback = function(args)
          if pcall(vim.treesitter.start, args.buf) then
            vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
          end
        end,
      })
    end,
  },
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {},
  },
  {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
      bigfile = { enabled = true },
      explorer = { enabled = true },
      input = { enabled = true },
      notifier = { enabled = true },
      picker = {
        enabled = true,
        sources = {
          explorer = { hidden = true, ignored = true },
        },
      },
      terminal = {},
    },
  },
  {
    "akinsho/bufferline.nvim",
    event = "VeryLazy",
    opts = {
      options = {
        mode = "buffers",
        show_buffer_icons = false,
        show_buffer_close_icons = false,
        show_close_icon = false,
        separator_style = "thin",
        diagnostics = "nvim_lsp",
        offsets = {
          {
            filetype = "snacks_layout_box",
            text = "Explorer",
            highlight = "Directory",
            text_align = "left",
            separator = true,
          },
        },
      },
    },
  },
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {},
  },
  {
    "sindrets/diffview.nvim",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewToggleFiles", "DiffviewFileHistory" },
    keys = {
      { "<leader>g", nil, desc = "Git" },
      { "<leader>gd", "<cmd>DiffviewOpen<cr>", desc = "Diff unstaged changes" },
      { "<leader>gD", "<cmd>DiffviewClose<cr>", desc = "Close diff view" },
      { "<leader>gh", "<cmd>DiffviewFileHistory<cr>", desc = "Repo file history" },
      { "<leader>gf", "<cmd>DiffviewFileHistory %<cr>", desc = "Current file history" },
    },
    opts = {},
  },
  { "mason-org/mason.nvim", opts = {} },
  {
    "mason-org/mason-lspconfig.nvim",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "mason-org/mason.nvim",
      "neovim/nvim-lspconfig",
    },
    opts = {
      ensure_installed = { "marksman", "ruff", "ty" },
      automatic_enable = { "marksman", "ruff", "ty" },
    },
  },
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    dependencies = { "mason-org/mason.nvim" },
    opts = {
      ensure_installed = { "prettier" },
    },
  },
  {
    "stevearc/conform.nvim",
    keys = {
      {
        "<leader>cf",
        function() require("conform").format({ lsp_fallback = true }) end,
        mode = { "n", "v" },
        desc = "Format buffer",
      },
    },
    opts = {
      formatters_by_ft = {
        markdown = { "prettier" },
      },
    },
  },
  {
    "nvim-lualine/lualine.nvim",
    event = "VeryLazy",
    opts = {
      options = {
        theme = "auto",
        icons_enabled = false,
        component_separators = { left = "|", right = "|" },
        section_separators = { left = "", right = "" },
      },
    },
  },
  {
    "coder/claudecode.nvim",
    event = "VeryLazy",
    opts = {
      terminal_cmd = "claude --settings '{\"editorMode\":\"vim\"}'",
      diff_opts = {
        keep_terminal_focus = true,
      },
    },
    keys = {
      { "<leader>a", nil, desc = "AI/Claude Code" },
      { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
      { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
      { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
      { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
      { "<leader>am", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select model" },
      { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add current buffer" },
      { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send selection" },
      { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
      { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Deny diff" },
    },
  },
}, {
  checker = { enabled = false },
})
