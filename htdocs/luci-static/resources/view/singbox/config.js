'use strict';
'import ui';
'import fs';
'import view';
'import form';

/*
 * 使用 L.view.extend 並在內部顯式調用 L.require 確保模組可用
 */
return L.view.extend({
	render: function() {
		// 關鍵修正：不再依賴頂層變數，直接從 L 命名空間中獲取模組
		var luci_form = L.require('form');
		var luci_fs = L.require('fs');

		return Promise.all([luci_form, luci_fs]).then(L.bind(function(modules) {
			var form = modules[0];
			var fs = modules[1];
			var m, s, o;

			m = new form.Map('sing-box', _('Sing-box Bridge'), _('輕量級內核管理工具，專為 daed 配套設計。'));

			// --- 1. 內核資訊 ---
			s = m.section(form.TypedSection, '_info', _('內核狀態'));
			s.anonymous = true;
			s.render = L.bind(function() {
				return fs.exec('/usr/bin/sing-box', ['version']).then(function(res) {
					var ver = (res.code === 0) ? res.stdout.split('\n')[0] : _('未安裝');
					return E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('版本 / 架構')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('span', { 'class': 'label' }, ver + ' (' + L.env.arch + ')')
						])
					]);
				});
			}, this);

			// --- 2. 服務控制 ---
			s = m.section(form.NamedSection, 'main', 'singbox', _('服務開關'));
			s.addremove = false;
			o = s.option(form.Flag, 'enabled', _('啟用外置內核'));
			o.rmempty = false;

			o = s.option(form.Value, 'conffile', _('設定檔路徑'));
			o.placeholder = '/etc/sing-box/config.json';

			// --- 3. 節點管理 ---
			s = m.section(form.GridSection, 'node', _('節點配置庫'), _('在這裡手動貼入 Outbound JSON 片段。'));
			s.addremove = true;
			s.nodescriptions = true;

			o = s.option(form.Value, 'name', _('節點標籤'));
			o.rmempty = false;

			o = s.option(form.TextValue, 'config_json', _('JSON 配置'));
			o.rows = 15;
			o.wrap = 'off';
			o.modalonly = true;

			return m.render();
		}, this));
	}
});
