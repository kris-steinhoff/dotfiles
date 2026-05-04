-- Set leader before plugins load (lazy.nvim mappings depend on it)
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- Bootstrap lazy.nvim on first run
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git", "clone", "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Options
local opt = vim.opt
opt.number = true
opt.relativenumber = true
opt.signcolumn = "yes"
opt.cursorline = true
opt.expandtab = true
opt.shiftwidth = 4
opt.tabstop = 4
opt.smartindent = true
opt.wrap = true
opt.linebreak = true
opt.ignorecase = true
opt.smartcase = true
opt.incsearch = true
opt.hlsearch = true
opt.termguicolors = true
opt.scrolloff = 8
opt.updatetime = 250
opt.undofile = true
opt.splitright = true
opt.splitbelow = true
opt.clipboard = "unnamedplus"

-- Keymaps
local map = vim.keymap.set
map("n", "<Esc>", "<cmd>nohlsearch<CR>")
map("n", "<leader>e", vim.diagnostic.open_float, { desc = "Show diagnostic" })
map("n", "[d", vim.diagnostic.goto_prev, { desc = "Prev diagnostic" })
map("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })

-- LSP keymaps attach when a server starts on a buffer
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(ev)
    local o = { buffer = ev.buf }
    map("n", "gd", vim.lsp.buf.definition, o)
    map("n", "gr", vim.lsp.buf.references, o)
    map("n", "K", vim.lsp.buf.hover, o)
    map("n", "<leader>rn", vim.lsp.buf.rename, o)
    map("n", "<leader>ca", vim.lsp.buf.code_action, o)
  end,
})

-- Plugins
require("lazy").setup({
  -- Colorscheme
  {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    config = function() vim.cmd.colorscheme("tokyonight-night") end,
  },

  -- File explorer as a buffer (vim-style)
  {
    "stevearc/oil.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    opts = {},
    keys = { { "-", "<cmd>Oil<cr>", desc = "Open parent directory" } },
  },

  -- Syntax/parsing
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "master",
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter.configs").setup({
        ensure_installed = {
          "lua", "vim", "vimdoc", "bash", "python", "go",
          "javascript", "typescript", "tsx", "json", "yaml",
          "markdown", "markdown_inline", "hcl", "dockerfile",
        },
        auto_install = true,
        highlight = { enable = true },
        indent = { enable = true },
      })
    end,
  },

  -- Fuzzy finder
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
    },
    config = function()
      local b = require("telescope.builtin")
      map("n", "<leader>ff", b.find_files, { desc = "Find files" })
      map("n", "<leader>fg", b.live_grep, { desc = "Live grep" })
      map("n", "<leader>fb", b.buffers, { desc = "Buffers" })
      map("n", "<leader>fh", b.help_tags, { desc = "Help tags" })
      map("n", "<leader>fs", b.lsp_document_symbols, { desc = "Doc symbols" })
      pcall(require("telescope").load_extension, "fzf")
    end,
  },

  -- LSP: mason installs servers, lspconfig wires them up
  { "williamboman/mason.nvim", opts = {} },
  {
    "williamboman/mason-lspconfig.nvim",
    opts = { ensure_installed = { "lua_ls", "pyright", "gopls", "ts_ls" } },
  },
  {
    "neovim/nvim-lspconfig",
    config = function()
      vim.lsp.enable({ "lua_ls", "pyright", "gopls", "ts_ls" })
    end,
  },

  -- Completion (Rust-backed, replaces nvim-cmp)
  {
    "saghen/blink.cmp",
    version = "*",
    opts = {
      keymap = { preset = "default" },
      sources = { default = { "lsp", "path", "snippets", "buffer" } },
    },
  },

  -- Git
  { "lewis6991/gitsigns.nvim", opts = {} },

  -- Statusline
  {
    "nvim-lualine/lualine.nvim",
    opts = { options = { theme = "tokyonight", icons_enabled = false, section_separators = "", component_separators = "" } },
  },

  -- Small, focused editing helpers from one author
  {
    "echasnovski/mini.nvim",
    config = function()
      require("mini.surround").setup()
      require("mini.ai").setup()
      require("mini.pairs").setup()
      require("mini.comment").setup()
    end,
  },
})
