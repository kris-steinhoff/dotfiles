
execute pathogen#infect()

set nocompatible
filetype on
filetype indent on
filetype plugin on
compiler ruby

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
    set completeopt+=longest,noinsert,noselect
catch /E474: Invalid argument/
endtry

let g:mucomplete#enable_auto_at_startup = 1
