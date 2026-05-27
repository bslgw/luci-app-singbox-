'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 自定義錯誤彈窗
	showError: function(msg) {
		L.ui.showModal(_('操作出錯'), [
			E('div', { 'class': 'alert-message danger' }, [ E('p', msg) ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('關閉'))
			])
		]);
	},

	checkStatus: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['status']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		}).catch(function(){});
	},

	handleAction: function(action, filename, confdir) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		var backup = confdir + '/original_backup.json';

		if (action === 'switch') {
			L.ui.showModal(_('應用配置'), [E('p', { 'class': 'spinning' }, _('正在處理...'))]);
			
			// 權限安全策略：讀取內容再寫入，繞過直接 cp 的權限限制
			return L.fs.read(source).then(function(content) {
				return L.fs.write(target, content).then(function() {
					return L.fs.exec('/etc/init.d/sing-box', ['restart']);
				});
			}).then(function() {
				L.ui.hideModal();
				L.ui.addNotification(null, E('p', _('成功切換配置')), 'info');
			}).catch(L.bind(function(e) {
				L.ui.hideModal();
				this.showError(_('無法套用配置：%s').format(e.message || e));
			}, this));
		} else if (action === 'delete') {
			if (!confirm(_('確定刪除 %s ？').format(filename))) return;
			return L.fs.remove(source).then(function() { location.reload(); });
		}
	},

	handleEdit: function(filename, confdir) {
		var path = confdir + '/' + filename;
		// 修正空檔案讀取邏輯
		return L.fs.read(path).then(L.bind(function(content) {
			var val = (content === null || content === '') ? '{}' : content;
			var textarea = E('textarea', { 'style': 'width:100%; height:400px; font-family:monospace;' }, [ val ]);
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
		}, this)).catch(L.bind(function(e) {
			this.showError(_('讀取失敗：%s').format(e));
		}, this));
	},

	handleCreate: function(confdir) {
		var nameInput = E('input', { 'placeholder': 'new.json', 'style': 'width:100%' });
		L.ui.showModal(_('新建配置'), [
			E('div', { 'style': 'padding:10px' }, [
				E('p', _('輸入檔名 (.json):')),
				nameInput,
				E('div', { 'style': 'margin-top:10px; text-align:right' }, [
					E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
					E('button', { 'class': 'btn cbi-button-positive', 'style': 'margin-left:10px', 'click': function() {
						var fname = nameInput.value.trim();
						if (!fname.endsWith('.json')) return alert(_('格式錯誤'));
						return L.fs.write(confdir + '/' + fname, '{}').then(function() { location.reload(); });
					}}, _('建立'))
				])
			])
		]);
	},

	render: function() {
		return Promise.all([
			L.resolveDefault(L.require('form'), {}),
			L.resolveDefault(L.require('fs'), {}),
			L.resolveDefault(L.require('ui'), {}),
			L.resolveDefault(L.require('uci'), {}),
			L.resolveDefault(L.require('poll'), {})
		]).then(L.bind(function(results) {
			var form = results[0], fs = results[1], ui = results[2], uci = results[3], poll = results[4];
			L.ui = ui; L.fs = fs; L.poll = poll; L.uci = uci;

			var m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));
			var s = m.section(form.TypedSection, '_status', _('服務控制'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				this.checkStatus();
				poll.add(L.bind(this.checkStatus, this), 5);
				return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center;' }, [
					E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('狀態')),
					E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:#999;' }, _('檢測中...')),
						E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('目錄: ')),
						E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
						E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': function() { 
							return L.fs.exec('/etc/init.d/sing-box', ['restart']).then(L.bind(this.checkStatus, this)); 
						}.bind(this) }, _('重啟服務'))
					])
				]);
			}, this);

			s = m.section(form.TypedSection, '_list', _('可用配置'));
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
								E('td', { 'class': 'td' }, file.name),
								E('td', { 'class': 'td', 'style': 'white-space:nowrap; text-align:center;' }, [
									E('button', { 'class': 'btn cbi-button-apply', 'style': 'margin:0 2px;', 'click': L.ui.createHandlerFn(this, 'handleAction', 'switch', file.name, confdir) }, _('選用')),
									E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin:0 2px;', 'click': L.ui.createHandlerFn(this, 'handleEdit', file.name, confdir) }, _('編輯')),
									E('button', { 'class': 'btn cbi-button-remove', 'style': 'margin:0 2px;', 'click': L.ui.createHandlerFn(this, 'handleAction', 'delete', file.name, confdir) }, _('刪除'))
								])
							]));
						}
					}, this));
					return E('div', {}, [ table, E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-top:10px;', 'click': L.ui.createHandlerFn(this, 'handleCreate', confdir) }, _('＋ 新建配置')) ]);
				}, this)).catch(function() { return E('div', { 'class': 'alert-message warning' }, _('目錄讀取失敗。')); });
			}, this);

			return m.render();
		}, this));
	}
});
