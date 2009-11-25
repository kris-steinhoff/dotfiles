set nocompatible
filetype on
filetype indent on
filetype plugin on
compiler ruby

set showmode
set ruler
set showcmd

set incsearch
set nowrapscan
set showmatch
"set hlsearch
set ignorecase
set smartcase

set shiftwidth=4
set softtabstop=4
set autoindent
set smartindent
set expandtab

set wrap linebreak textwidth=0

set backspace=indent,eol,start

" Set colors
hi clear
if exists("syntax_on")
    syntax reset
endif

hi Comment      ctermfg=cyan    cterm=none      gui=none
hi Constant     ctermfg=green   cterm=none      gui=none
hi Special      ctermfg=magenta cterm=none      gui=none
hi Identifier   ctermfg=red     cterm=none      gui=none
hi Statement    ctermfg=yellow  cterm=none      gui=none
hi PreProc      ctermfg=magenta cterm=none      gui=none
hi type         ctermfg=yellow  cterm=none      gui=none
hi Underlinedr  cterm=underline term=underline  gui=none
" end Set colors

syntax on
