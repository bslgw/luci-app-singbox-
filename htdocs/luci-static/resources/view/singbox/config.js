'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import poll';

return L.view.extend({
	// 檢查服務狀態
	checkStatus: function() {
		return fs.exec('/usr/bin/pgrep', ['sing-box']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		});
	},

	// 切換配置的核心邏輯
	handleSwitch: function(filename, confdir) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		
		ui.showModal(_('切換配置中'), [E('p', _('正在應用 %s ...').format(filename))]);
		
		return fs.exec('/bin/cp', [source, target]).then(function() {
			return fs.exec('/etc/init.d/sing-box', ['restart']);
		}).then(function() {
			ui.hideModal();
			ui.addNotification(null, E('p', _('配置已更換為 %s 並重啟服務').format(filename)), 'info');
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('操作失敗: %s').format(e)), 'danger');
		});
	},

	render: function() {
		var luci_form = L.require('form');
		var luci_fs = L.require('fs');

		return Promise.all([luci_form, luci_fs]).then(L.bind(function(modules) {
			var form = modules;
			var fs = modules;
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
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:2px 6px; border-radius:3px;' }, _('檢測中...'))
					])
				]);
			}, this);

			// --- 2. 基礎設置 ---
			s = m.section(form.NamedSection, 'main', 'singbox', _('基礎設置'));
			o = s.option(form.Value, 'confdir', _('配置文件所在目錄'));
			o.default = '/etc/sing-box';

			// --- 3. 自動發現列表 (動態渲染) ---
			s = m.section(form.TypedSection, '_list', _('配置檔案列表'));
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

					files.forEach(L.bind(function(file) {
						if (file.name.endsWith('.json') && file.name !== 'config.json') {
							table.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td' }, file.name),
								E('td', { 'class': 'td' }, [
									E('button', {
										'class': 'cbi-button cbi-button-apply',
										'click': ui.createHandlerFn(this, 'handleSwitch', file.name, confdir)
									}, _('選用並重啟'))
								])
							]));
						}
					}, this));

					return table;
				}, this)).catch(function() {
					return E('div', { 'class': 'alert-message warning' }, _('無法讀取目錄，請確認路徑正確且權限開啟。'));
				});
			}, this);

			return m.render();
		}, this));
	}
});
