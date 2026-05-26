'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 檢查服務狀態的函數
	checkStatus: function() {
		return L.resolveDefault(fs.exec('/usr/bin/pgrep', ['sing-box']), {}).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		});
	},

	// 切換配置的核心邏輯：將選中的檔案複製為 config.json 並重啟
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
		// 修正點：使用 Promise.all 確保模組加載後，精確提取對象
		return Promise.all([
			L.resolveDefault(L.require('form'), {}),
			L.resolveDefault(L.require('fs'), {}),
			L.resolveDefault(L.require('uci'), {})
		]).then(L.bind(function(modules) {
			var form = modules[0]; // 顯式指定索引
			var fs = modules[1];
			var uci = modules[2];
			var m, s, o;

			m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));

			// --- 1. 服務狀態區域 ---
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
			o.rmempty = false;

			// --- 3. 自動發現列表 (動態掃描目錄下的 JSON 檔案) ---
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

					files.forEach(L.bind(function(file) {
						// 過濾出 JSON 檔案，且排除掉正在使用的目標檔案
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
					return E('div', { 'class': 'alert-message warning' }, _('無法讀取目錄，請確認路徑正確。'));
				});
			}, this);

			return m.render();
		}, this));
	}
});
