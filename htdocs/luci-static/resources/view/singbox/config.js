'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 使用 L.fs 代替 fs，確保在函數內部可用
	checkStatus: function() {
		return L.resolveDefault(L.fs.exec('/usr/bin/pgrep', ['sing-box']), {}).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		});
	},

	handleSwitch: function(filename, confdir) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		
		L.ui.showModal(_('切換配置中'), [E('p', _('正在應用 %s ...').format(filename))]);
		
		return L.fs.exec('/bin/cp', [source, target]).then(function() {
			return L.fs.exec('/etc/init.d/sing-box', ['restart']);
		}).then(function() {
			L.ui.hideModal();
			L.ui.addNotification(null, E('p', _('配置已更換為 %s 並重啟服務').format(filename)), 'info');
		}).catch(function(e) {
			L.ui.hideModal();
			L.ui.addNotification(null, E('p', _('操作失敗: %s').format(e)), 'danger');
		});
	},

	render: function() {
		// 預先加載所有模組到 L 命名空間，徹底杜絕 undefined
		return Promise.all([
			L.require('form'),
			L.require('fs'),
			L.require('ui'),
			L.require('uci'),
			L.require('poll')
		]).then(L.bind(function(modules) {
			var form = modules[0];
			var fs = modules[1];
			var ui = modules[2];
			var uci = modules[3];
			var poll = modules[4];
			
			// 將模組掛載到全局 L 下供其他函數使用
			L.ui = ui;
			L.fs = fs;

			var m, s, o;

			m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));

			// --- 1. 服務狀態 ---
			s = m.section(form.TypedSection, '_status', _('服務狀態'));
			s.anonymous = true;
			s.render = L.bind(function() {
				poll.add(L.bind(this.checkStatus, this), 5);
				return E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('當前狀態')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:2px 6px; border-radius:3px; background:#999;' }, _('檢測中...'))
					])
				]);
			}, this);

			// --- 2. 基礎設置 ---
			s = m.section(form.NamedSection, 'main', 'singbox', _('基礎設置'));
			o = s.option(form.Value, 'confdir', _('配置文件所在目錄'));
			o.default = '/etc/sing-box';
			o.rmempty = false;

			// --- 3. 可用配置列表 ---
			s = m.section(form.TypedSection, '_list', _('可用配置檔案'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				
				return fs.list(confdir).then(L.bind(function(files) {
					var table = E('table', { 'class': 'table cbi-section-table' }, [
						E('tr', { 'class': 'tr cbi-section-table-titles' }, [
							E('th', { 'class': 'th' }, _('檔案名稱')),
							E('th', { 'class': 'th' }, _('操作'))
						])
					]);

					var hasJson = false;
					files.forEach(L.bind(function(file) {
						if (file.name.endsWith('.json') && file.name !== 'config.json') {
							hasJson = true;
							table.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td' }, file.name),
								E('td', { 'class': 'td' }, [
									E('button', {
										'class': 'cbi-button cbi-button-apply',
										'click': L.ui.createHandlerFn(this, 'handleSwitch', file.name, confdir)
									}, _('選用並重啟'))
								])
							]));
						}
					}, this));

					return hasJson ? table : E('div', { 'class': 'alert-message info' }, _('目錄中沒有可用的 JSON 配置檔案。'));
				}, this)).catch(function() {
					return E('div', { 'class': 'alert-message warning' }, _('無法讀取目錄，請確認路徑正確。'));
				});
			}, this);

			return m.render();
		}, this));
	}
});
