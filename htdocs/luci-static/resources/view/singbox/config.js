'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 使用系統服務指令檢查狀態，這比 pgrep 更準確
	checkStatus: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['status']).then(function(res) {
			// 通常 OpenWrt 服務腳本返回 0 代表 running
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		}).catch(function() {
			// 如果 init 腳本不支持 status，回退到檢測進程名
			return L.fs.exec('/usr/bin/pgrep', ['sing-box']).then(function(res) {
				var isRunning = (res.code === 0);
				var el = document.getElementById('sb_status_label');
				if (el && isRunning) {
					el.textContent = _('運行中 (進程檢測)');
					el.style.background = '#46a546';
				}
			});
		});
	},

	handleAction: function(action, filename, confdir) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;

		if (action === 'switch') {
			L.ui.showModal(_('應用配置'), [E('p', _('正在將 %s 覆蓋為核心配置...').format(filename))]);
			return L.fs.exec('/bin/cp', [source, target]).then(function() {
				return L.fs.exec('/etc/init.d/sing-box', ['restart']);
			}).then(function() {
				L.ui.hideModal();
				L.ui.addNotification(null, E('p', _('成功切換至 %s').format(filename)), 'info');
			});
		} else if (action === 'delete') {
			if (!confirm(_('確定要刪除設定檔 %s 嗎？').format(filename))) return;
			return L.fs.remove(source).then(function() { location.reload(); });
		}
	},

	handleEdit: function(filename, confdir) {
		var path = confdir + '/' + filename;
		return L.fs.read(path).then(function(content) {
			var textarea = E('textarea', { 'style': 'width:100%; height:400px; font-family:monospace; font-size:12px;' }, [ content ]);
			L.ui.showModal(_('編輯配置: %s').format(filename), [
				E('div', { 'style': 'padding:10px' }, [
					textarea,
					E('div', { 'style': 'margin-top:10px; text-align:right' }, [
						E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
						E('button', {
							'class': 'btn cbi-button-positive',
							'style': 'margin-left:10px',
							'click': function() {
								return L.fs.write(path, textarea.value).then(function() {
									L.ui.hideModal();
									L.ui.addNotification(null, E('p', _('檔案已儲存')), 'info');
								});
							}
						}, _('儲存'))
					])
				])
			]);
		});
	},

	render: function() {
		return Promise.all([L.require('form'), L.require('fs'), L.require('ui'), L.require('uci'), L.require('poll')]).then(L.bind(function(modules) {
			var form = modules, fs = modules, ui = modules, uci = modules, poll = modules;
			L.ui = ui; L.fs = fs;

			var m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));

			// 1. 服務控制區
			var s = m.section(form.TypedSection, '_status', _('服務控制'));
			s.anonymous = true;
			s.render = L.bind(function() {
				poll.add(L.bind(this.checkStatus, this), 5);
				return E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('運行狀態')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:2px 6px; border-radius:3px; background:#999;' }, _('檢測中...')),
						E('button', { 
							'class': 'cbi-button cbi-button-reset', 
							'style': 'margin-left:10px;', 
							'click': function() { return L.fs.exec('/etc/init.d/sing-box', ['restart']).then(L.bind(this.checkStatus, this)); }.bind(this)
						}, _('重啟服務'))
					])
				]);
			}, this);

			// 2. 基礎設置
			s = m.section(form.NamedSection, 'main', 'singbox', _('基礎設置'));
			s.option(form.Value, 'confdir', _('配置文件目錄')).default = '/etc/sing-box';

			// 3. 檔案列表管理
			s = m.section(form.TypedSection, '_list', _('可用配置文件'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				return fs.list(confdir).then(L.bind(function(files) {
					var table = E('table', { 'class': 'table cbi-section-table' }, [
						E('tr', { 'class': 'tr cbi-section-table-titles' }, [
							E('th', { 'class': 'th' }, _('檔案名稱')),
							E('th', { 'class': 'th', 'style': 'width:200px' }, _('管理操作'))
						])
					]);

					files.forEach(L.bind(function(file) {
						if (file.name.endsWith('.json') && file.name !== 'config.json') {
							table.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td' }, file.name),
								E('td', { 'class': 'td' }, [
									E('button', { 'class': 'btn cbi-button-apply', 'style': 'margin-right:4px', 'click': L.ui.createHandlerFn(this, 'handleAction', 'switch', file.name, confdir) }, _('選用')),
									E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin-right:4px', 'click': L.ui.createHandlerFn(this, 'handleEdit', file.name, confdir) }, _('編輯')),
									E('button', { 'class': 'btn cbi-button-remove', 'click': L.ui.createHandlerFn(this, 'handleAction', 'delete', file.name, confdir) }, _('刪除'))
								])
							]));
						}
					}, this));
					return table;
				}, this)).catch(function() {
					return E('div', { 'class': 'alert-message warning' }, _('目錄讀取失敗。'));
				});
			}, this);

			return m.render();
		}, this));
	}
});
