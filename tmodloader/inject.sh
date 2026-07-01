#!/bin/sh
# Send a command to the running tModLoader tmux session.
tmux send-keys -t tmodloader "$1" Enter
