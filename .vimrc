
execute pathogen#infect()

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

" Set 2-space tabs for YAML
autocmd FileType yaml setlocal ts=2 sts=2 sw=2 expandtab

" Less intrusive paren matching
highlight MatchParen cterm=bold ctermbg=none

autocmd FileType python setlocal nonumber

" set colorcolun to grey in pythomode
hi ColorColumn ctermbg=8

" remove tabeline 'X'
let tabulousCloseStr = ''
