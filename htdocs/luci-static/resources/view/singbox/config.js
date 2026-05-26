'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

/*
 * 使用 L.view.extend 並顯式傳入模組，確保 form 和 fs 可用
 */
return L.view.extend({
	render: function() {
		// 顯式宣告，防止模組未定義
		var m, s, o;

		m = new form.Map('sing-box', _('Sing-box Bridge'), _('輕量級內核管理工具，專為 daed 配套設計。'));

		// --- 1. 內核資訊 ---
		s = m.section(form.TypedSection, '_info', _('內核資訊'));
		s.anonymous = true;
		s.render = L.bind(function() {
			return fs.exec('/usr/bin/sing-box', ['version']).then(function(res) {
				var ver = (res.code === 0) ? res.stdout.split('\n')[0] : _('未安裝或無法執行');
				return E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Version / Arch')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { 'class': 'label' }, ver + ' (' + L.env.arch + ')')
					])
				]);
			}).catch(function(e) {
				return E('div', { 'class': 'cbi-value' }, _('讀取版本失敗'));
			});
		}, this);

		// --- 2. 服務狀態 ---
		s = m.section(form.NamedSection, 'main', 'singbox', _('服務狀態'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('啟用服務'));
		o.rmempty = false;

		o = s.option(form.Value, 'conffile', _('設定檔路徑'));
		o.placeholder = '/etc/sing-box/config.json';
		o.datatype = 'file';

		// --- 3. 節點管理 ---
		s = m.section(form.GridSection, 'node', _('節點配置庫'));
		s.addremove = true;
		s.nodescriptions = true;

		o = s.option(form.Value, 'name', _('標籤'));
		o.rmempty = false;

		o = s.option(form.TextValue, 'config_json', _('JSON 配置'));
		o.rows = 15;
		o.wrap = 'off';
		o.modalonly = true;

		return m.render();
	}
});
