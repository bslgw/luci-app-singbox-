#!/bin/sh
# 告訴瀏覽器這是一個 JSON 格式的數據，並允許跨域請求
cat <<EOF
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type

EOF

# 處理跨域預檢請求
if [ "$REQUEST_METHOD" = "OPTIONS" ]; then
    exit 0
fi

# 讀取 sing-box 配置文件目錄，若 UCI 未配置則使用默認路徑
CONF_DIR=$(uci -q get sing-box.main.confdir)
[ -z "$CONF_DIR" ] && CONF_DIR="/etc/sing-box"

# 從網址參數中獲取具體的操作指令 (Action)
ACTION=$(echo "$QUERY_STRING" | sed -n 's/.*action=\([^&]*\).*/\1/p')

case "$ACTION" in
    status)
        # 檢查 sing-box 運行狀態
        /etc/init.d/sing-box status >/dev/null 2>&1
        RUNNING=$?
        SELECTED=$(cat /tmp/sb_selected_conf 2>/dev/null || echo "")
        echo "{\"running\": $((!RUNNING)), \"selected\": \"$SELECTED\", \"confdir\": \"$CONF_DIR\"}"
        ;;
        
    list)
        # 遍歷目錄下的 JSON 配置文件（排除 config.json 主文件）
        echo "["
        FIRST=1
        for f in "$CONF_DIR"/*.json; do
            [ -e "$f" ] || break
            FNAME=$(basename "$f")
            [ "$FNAME" = "config.json" ] && continue
            
            MTIME=$(date -r "$f" +%s 2>/dev/null || echo 0)
            # 讀取內容並轉義雙引號，方便前端解析
            CONTENT=$(cat "$f" | tr -d '\n' | sed 's/"/\\"/g')
            
            [ $FIRST -ne 1 ] && echo ","
            FIRST=0
            echo "{\"name\": \"$FNAME\", \"mtime\": $MTIME, \"content\": \"$CONTENT\"}"
        done
        echo "]"
        ;;
        
    read)
        # 讀取單個配置文件內容
        FILE=$(echo "$QUERY_STRING" | sed -n 's/.*file=\([^&]*\).*/\1/p')
        if [ -f "$CONF_DIR/$FILE" ]; then
            cat "$CONF_DIR/$FILE"
        else
            echo "{\"error\": \"File not found\"}"
        fi
        ;;
        
    write)
        # 接收前端 POST 傳過來的 JSON 代碼並寫入文件
        FILE=$(echo "$QUERY_STRING" | sed -n 's/.*file=\([^&]*\).*/\1/p')
        read -n "$CONTENT_LENGTH" POST_DATA
        echo "$POST_DATA" > "$CONF_DIR/$FILE"
        echo "{\"success\": true}"
        ;;
        
    delete)
        # 刪除配置文件
        FILE=$(echo "$QUERY_STRING" | sed -n 's/.*file=\([^&]*\).*/\1/p')
        if [ "$FILE" != "config.json" ] && [ -f "$CONF_DIR/$FILE" ]; then
            rm "$CONF_DIR/$FILE"
            echo "{\"success\": true}"
        else
            echo "{\"error\": \"Delete failed\"}"
        fi
        ;;
        
    switch)
        # 切換配置文件：複製為 config.json，記錄選擇，並重啟服務
        FILE=$(echo "$QUERY_STRING" | sed -n 's/.*file=\([^&]*\).*/\1/p')
        if [ -f "$CONF_DIR/$FILE" ]; then
            cp "$CONF_DIR/$FILE" "$CONF_DIR/config.json"
            echo "$FILE" > /tmp/sb_selected_conf
            /etc/init.d/sing-box restart >/dev/null 2>&1
            echo "{\"success\": true}"
        else
            echo "{\"error\": \"Config file not found\"}"
        fi
        ;;
        
    restart)
        # 重啟 sing-box
        /etc/init.d/sing-box restart >/dev/null 2>&1
        echo "{\"success\": true}"
        ;;
        
    stop)
        # 停止 sing-box
        /etc/init.d/sing-box stop >/dev/null 2>&1
        echo "{\"success\": true}"
        ;;
        
    test_net)
        # 網絡連通性測試（國內 223.5.5.5，國外 Google）
        curl -I -s --connect-timeout 2 http://223.5.5.5 >/dev/null 2>&1
        CN=$?
        curl -I -s --connect-timeout 2 http://www.google.com/generate_204 >/dev/null 2>&1
        GLOBAL=$?
        
        if [ $CN -eq 0 ] && [ $GLOBAL -eq 0 ]; then STATE="all_ok"
        elif [ $CN -eq 0 ]; then STATE="cn_only"
        elif [ $GLOBAL -eq 0 ]; then STATE="global_only"
        else STATE="offline"; fi
        echo "{\"state\": \"$STATE\"}"
        ;;
        
    *)
        echo "{\"error\": \"Invalid action\"}"
        ;;
esac
