" Plugins will be downloaded under the specified directory.
call plug#begin('~/.vim/plugged')

" Declare the list of plugins.
Plug 'tpope/vim-sensible'

Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'

Plug 'ctrlpvim/ctrlp.vim'
Plug 'scrooloose/nerdtree'

Plug 'saltstack/salt-vim'

Plug 'Quramy/tsuquyomi'
Plug 'leafgarland/typescript-vim'

Plug 'tpope/vim-commentary'

Plug 'tpope/vim-obsession'

Plug 'tpope/vim-fugitive'
Plug 'airblade/vim-gitgutter'

Plug 'Vimjas/vim-python-pep8-indent'
Plug 'tmhedberg/SimpylFold'

Plug 'mhinz/vim-startify'

if v:version < 800
    Plug 'vim-syntastic/syntastic'
    Plug 'lifepillar/vim-mucomplete'
endif

if v:version >= 800
    Plug 'w0rp/ale'
    Plug 'maralla/completor.vim'
endif

" List ends here. Plugins become visible to Vim after this call.
call plug#end()

set nocompatible

filetype on
filetype indent on
filetype plugin on

set fillchars+=vert:\  " use space as vertical split char


set exrc
set showmode
set number
highlight LineNr ctermfg=darkgrey

set showcmd

" Search options
set incsearch
set nowrapscan
set showmatch
set ignorecase
set smartcase

set shiftwidth=4
set softtabstop=4
set smartindent
set expandtab

set wrap linebreak textwidth=0

set foldlevelstart=20

set background=dark

try
    set shortmess+=c
catch /E539: Illegal character/
endtry

set noshowmode
set completeopt-=preview
set completeopt+=menuone

try
    set completeopt+=noinsert
catch /E474: Invalid argument/
endtry

let g:mucomplete#enable_auto_at_startup = 1
let g:mucomplete#completion_delay = 100

" Set 2-space tabs for YAML
autocmd FileType yaml setlocal ts=2 sts=2 sw=2 expandtab

" Less intrusive paren matching
highlight MatchParen cterm=bold ctermbg=none

" less gaudy highlights for Ale
hi SpellBad ctermbg=darkgrey
hi SpellCap ctermbg=darkgrey


" set colorcolun to grey in pythomode
hi ColorColumn ctermbg=8
let g:pymode_rope = 0

" Update linting when exiting insert mode
let g:ale_lint_on_text_changed = 'normal'
let g:ale_lint_on_insert_leave = 1

" map linter previous and next errors
nmap <silent> <leader>aj :ALENext<cr>
nmap <silent> <leader>ak :ALEPrevious<cr>

" Disable completor.vim preview
let g:completor_complete_options='menuone,noselect,noinsert'

noremap <C-S-h>  <Plug>AirlineSelectPrevTab
noremap <C-S-l>  <Plug>AirlineSelectNextTab
" inoremap <C-S-h>  <Esc>:tabprevious<CR> i
" inoremap <C-S-l>  <Esc>:tabnext<CR> i
nnoremap <C-b>    :CtrlPBuffer<CR> let g:ctrlp_custom_ignore = { \ 'dir':  '^venv$\|\.egg-info$\|node_modules',
    \ 'file': 'Session.vim' }

let g:airline#extensions#tabline#show_close_button = 0
let g:airline#extensions#tabline#formatter = 'unique_tail_improved'
let g:airline#extensions#tabline#tab_nr_type = 2
let g:airline#extensions#tabline#enabled = 1
let g:airline#extensions#tabline#buffer_idx_mode = 1
nmap <leader>1 <Plug>AirlineSelectTab1
nmap <leader>2 <Plug>AirlineSelectTab2
nmap <leader>3 <Plug>AirlineSelectTab3
nmap <leader>4 <Plug>AirlineSelectTab4
nmap <leader>5 <Plug>AirlineSelectTab5
nmap <leader>6 <Plug>AirlineSelectTab6
nmap <leader>7 <Plug>AirlineSelectTab7
nmap <leader>8 <Plug>AirlineSelectTab8
nmap <leader>9 <Plug>AirlineSelectTab9

" Tab/buffer navigation with Ctrl-Shift-h and -l
" nmap <C-S-h>  <Plug>AirlineSelectPrevTab
" nmap <C-S-l>  <Plug>AirlineSelectNextTab
" imap <C-S-h>  <Esc> <Plug>AirlineSelectPrevTab i
" imap <C-S-l>  <Esc> <Plug>AirlineSelectNextTab i

nmap <leader>z  :tabedit %<CR>:set nonumber<CR>:set signcolumn=no<CR>

let g:tsuquyomi_disable_quickfix = 1

if v:version >= 800
    set signcolumn=yes
    set completeopt+=noselect

    " [completor.vim] Use Tab to select completion
    inoremap <expr> <Tab> pumvisible() ? "\<C-n>" : "\<Tab>"
    inoremap <expr> <S-Tab> pumvisible() ? "\<C-p>" : "\<S-Tab>"
    inoremap <expr> <cr> pumvisible() ? "\<C-y>\<cr>" : "\<cr>"

endif

try
    source ~/.vimrc.local
catch /E484/
endtry
