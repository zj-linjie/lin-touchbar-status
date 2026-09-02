set nodePath to "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
set helperPath to "/Users/apple/dev/touch-bar-agent-status/mtmr-pet-read.mjs"
set frameLabel to do shell script ("/usr/bin/env MTMR_PET_PREFIX=deepseek " & quoted form of nodePath & " " & quoted form of helperPath)
return {" ", frameLabel}
