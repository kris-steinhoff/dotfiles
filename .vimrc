
if v:version < 800
    execute pathogen#infect()
endif

set nocompatible
filetype on
filetype indent on
filetype plugin on
compiler ruby

" set mouse+=a
" if &term =~ '^screen'
"     " tmux knows the extended mouse mode
"     set ttymouse=xterm2
" endif
set fillchars+=vert:\ 


set exrc
set showmode
" set number
set ruler
set showcmd

set incsearch
set nowrapscan
set showmatch
" set hlsearch
set ignorecase
set smartcase

set shiftwidth=4
set softtabstop=4
set autoindent
set smartindent
set expandtab

set wrap linebreak textwidth=0

set backspace=indent,eol,start

set foldlevelstart=20

syntax on

set background=dark
set laststatus=2

try
    set shortmess+=c
catch /E539: Illegal character/
endtry

set noshowmode
set completeopt-=preview
set completeopt+=menuone

try
    set completeopt+=longest,noinsert
catch /E474: Invalid argument/
endtry

let g:mucomplete#enable_auto_at_startup = 1
let g:mucomplete#completion_delay = 100

" Set 2-space tabs for YAML
autocmd FileType yaml setlocal ts=2 sts=2 sw=2 expandtab

" Less intrusive paren matching
highlight MatchParen cterm=bold ctermbg=none

autocmd FileType python setlocal nonumber

" set colorcolun to grey in pythomode
hi ColorColumn ctermbg=8
let g:pymode_rope = 0

" remove tabeline 'X'
let tabulousCloseStr = ''
let tabulousLabelModifiedStr = '+ '
let tabulousLabelNameOptions = ''

" Update linting when exiting insert mode
let g:ale_lint_on_text_changed = 'normal'
let g:ale_lint_on_insert_leave = 1

" to workaround a bug (https://github.com/w0rp/ale/issues/1334)
let g:ale_echo_cursor = 0

" [completor.vim] Use Tab to select completion
inoremap <expr> <Tab> pumvisible() ? "\<C-n>" : "\<Tab>"
inoremap <expr> <S-Tab> pumvisible() ? "\<C-p>" : "\<S-Tab>"
inoremap <expr> <cr> pumvisible() ? "\<C-y>\<cr>" : "\<cr>"
