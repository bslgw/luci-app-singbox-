'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
	// 需求 2：隱藏 OpenWrt 原生的三個底部按鈕 (保存並應用, 保存, 復位)
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	// 聯網狀態快取
	getCache: function() { return window.sessionStorage.getItem('sb_net_cache'); },
	setCache: function(val) { window.sessionStorage.setItem('sb_net_cache', val); },

	load: function() {
		return Promise.all([
			L.uci.load('sing-box'),
			L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
				return (res.code === 0);
			}).catch(function() { return false; })
		]);
	},

	checkNetwork: function(isExplicit) {
		var netEl = document.getElementById('sb_net_label');
		if (!netEl) return;

		var cached = this.getCache();

		// 只有狀態為空且主動觸發時顯示檢測中
		if (isExplicit && !cached) {
			netEl.textContent = _('檢測中...');
			netEl.style.background = '#ffc107';
		}

		// 使用 /bin/sh -c 包裹指令，解決 LuCI 環境執行差異問題
		return L.fs.exec('/bin/sh', ['-c', 'wget -q --spider --timeout=2 http://google.com && exit 0 || exit 1']).then(L.bind(function(res) {
			var isOnline = (res.code === 0);
			var current = isOnline ? 'online' : 'offline';

			// 只有狀態變更才更新 UI
			if (this.getCache() !== current) {
				netEl.textContent = isOnline ? _('聯網正常') : _('連接受阻');
				netEl.style.background = isOnline ? '#46a546' : '#dc3545';
				this.setCache(current);
			}
		}, this)).catch(L.bind(function() {
			if (this.getCache() !== 'offline') {
				netEl.textContent = _('連接受阻');
				netEl.style.background = '#dc3545';
				this.setCache('offline');
			}
		}, this));
	},


	checkStatus: function() {
		L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		}).catch(function(){});

		// 邏輯 4：後台檢測 5 秒一次，靜默執行
		this.checkNetwork(false);
	},

	doRestart: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['restart']);
	},

	// 邏輯 5：異步更新，不刷新頁面
	handleSwitch: function(filename, confdir, ev) {
		var btn = ev.target;
		btn.disabled = true; btn.textContent = _('正在應用...');

		return L.fs.read(confdir + '/' + filename).then(function(c) {
