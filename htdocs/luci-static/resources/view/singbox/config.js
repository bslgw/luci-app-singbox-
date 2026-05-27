'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 秒顯示狀態：增加立即執行的邏輯
	checkStatus: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['status']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		});
	},

	handleAction: function(action, filename, confdir) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;

		if (action === 'switch') {
			L.ui.showModal(_('應用配置'), [E('p', _('正在切換至 %s ...').format(filename))]);
			return L.fs.exec('/bin/cp', [source, target]).then(function() {
				return L.fs.exec('/etc/init.d/sing-box', ['restart']);
			}).then(function() {
				L.ui.hideModal();
				L.ui.addNotification(null, E('p', _('成功切換配置並重啟')), 'info');
			});
		} else if (action === 'delete') {
			if (!confirm(_('確定刪除 %s ？').format(filename))) return;
			return L.fs.remove(source).then(function() { location.reload(); });
		}
	},

	// 支援空檔案編輯：增加預設值處理
	handleEdit: function(filename, confdir) {
		var path = confdir + '/' + filename;
		return L.fs.read(path).then(function(content) {
			var val = content || '{\n  "type": "direct",\n  "tag": "direct-out"\n}';
			var textarea = E('textarea', { 'style': 'width:100%; height:400px; font-family:monospace; font-size:12px;' }, [ val ]);
			L.ui.showModal(_('編輯: %s').format(filename), [
				E('div', { 'style': 'padding:10px' }, [
					textarea,
					E('div', { 'style': 'margin-top:10px; text-align:right' }, [
						E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
						E('button', { 'class': 'btn cbi-button-positive', 'style': 'margin-left:10px', 'click': function() {
							return L.fs.write(path, textarea.value).then(function() { L.ui.hideModal(); });
						}}, _('儲存'))
					])
				])
			]);
		}).catch(function() { 
			// 如果檔案不存在，則建立新檔案
			return L.fs.write(path, '{}').then(function() { location.reload(); });
		});
	},

	// 新建配置功能
	handleCreate: function(confdir) {
		var nameInput = E('input', { 'placeholder': 'new_config.json', 'style': 'width:100%' });
		L.ui.showModal(_('新建配置文件'), [
			E('div', { 'style': 'padding:10px' }, [
				E('p', _('請輸入檔案名稱 (須以 .json 結尾):')),
				nameInput,
				E('div', { 'style': 'margin-top:10px; text-align:right' }, [
					E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
					E('button', { 'class': 'btn cbi-button-positive', 'style': 'margin-left:10px', 'click': function() {
						var fname = nameInput.value.trim();
						if (!fname.endsWith('.json')) return alert(_('檔名格式錯誤'));
						return L.fs.write(confdir + '/' + fname, '{}').then(function() { location.reload(); });
					}}, _('建立'))
				])
			])
		]);
	},

	render: function() {
		return Promise.all([L.require('form'), L.require('fs'), L.require('ui'), L.require('uci'), L.require('poll')]).then(L.bind(function(modules) {
			var form = modules, fs = modules, ui = modules, uci = modules, poll = modules;
			L.ui = ui; L.fs = fs;

			var m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));

			// 1. 狀態與路徑整合 (解決空間浪費)
			var s = m.section(form.TypedSection, '_status', _('服務控制'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				// 立即執行第一次狀態檢查
				this.checkStatus();
				poll.add(L.bind(this.checkStatus, this), 5);
				
				return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
					E('label', { 'class': 'cbi-value-title', 'style': 'margin-bottom:0; width:15%' }, _('運行狀態')),
					E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:#999;' }, _('檢測中...')),
						E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('工作目錄: ')),
						E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
						E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': function() { return L.fs.exec('/etc/init.d/sing-box', ['restart']); } }, _('重啟服務'))
					])
				]);
			}, this);

			// 2. 列表管理 (按鈕一行化與新建功能)
			s = m.section(form.TypedSection, '_list', _('可用配置文件'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				return fs.list(confdir).then(L.bind(function(files) {
					var table = E('table', { 'class': 'table cbi-section-table' }, [
						E('tr', { 'class': 'tr cbi-section-table-titles' }, [
							E('th', { 'class': 'th' }, _('檔案名稱')),
							E('th', { 'class': 'th', 'style': 'width:240px; text-align:center;' }, _('管理操作'))
						])
					]);

					files.forEach(L.bind(function(file) {
						if (file.name.endsWith('.json') && file.name !== 'config.json') {
							table.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td', 'style': 'vertical-align:middle;' }, file.name),
								E('td', { 'class': 'td', 'style': 'white-space:nowrap; text-align:center;' }, [
									E('button', { 'class': 'btn cbi-button-apply', 'style': 'margin:0 2px;', 'click': L.ui.createHandlerFn(this, 'handleAction', 'switch', file.name, confdir) }, _('選用')),
									E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin:0 2px;', 'click': L.ui.createHandlerFn(this, 'handleEdit', file.name, confdir) }, _('編輯')),
									E('button', { 'class': 'btn cbi-button-remove', 'style': 'margin:0 2px;', 'click': L.ui.createHandlerFn(this, 'handleAction', 'delete', file.name, confdir) }, _('刪除'))
								])
							]));
						}
					}, this));

					return E('div', {}, [
						table,
						E('div', { 'style': 'margin-top:10px' }, [
							E('button', { 'class': 'cbi-button cbi-button-add', 'click': L.ui.createHandlerFn(this, 'handleCreate', confdir) }, _('＋ 新建配置文件'))
						])
					]);
				}, this)).catch(function() { return E('div', { 'class': 'alert-message warning' }, _('目錄讀取失敗，請檢查 /etc/sing-box 是否存在。')); });
			}, this);

			return m.render();
		}, this));
	}
});
