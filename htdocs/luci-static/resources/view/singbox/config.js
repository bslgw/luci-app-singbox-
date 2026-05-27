'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 檢查狀態函數
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

	// 切換配置邏輯
	handleAction: function(action, filename, confdir) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		var backup = confdir + '/original_backup_from_bridge.json';

		if (action === 'switch') {
			L.ui.showModal(_('應用配置'), [E('p', { 'class': 'spinning' }, _('正在切換至 %s ...').format(filename))]);
			return L.fs.stat(backup).then(function(){}, function(){
				return L.fs.exec('/bin/cp', [target, backup]).catch(function(){});
			}).then(function() {
				return L.fs.exec('/bin/cp', [source, target]);
			}).then(function() {
				return L.fs.exec('/etc/init.d/sing-box', ['restart']);
			}).then(function() {
				L.ui.hideModal();
				L.ui.addNotification(null, E('p', _('切換成功！原始配置已備份。')), 'info');
			}).catch(function(e) {
				L.ui.hideModal();
				L.ui.addNotification(null, E('p', _('操作失敗: %s').format(e)), 'danger');
			});
		} else if (action === 'delete') {
			if (!confirm(_('確定刪除 %s ？').format(filename))) return;
			return L.fs.remove(source).then(function() { location.reload(); });
		}
	},

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
		});
	},

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
						if (!fname || !fname.endsWith('.json')) return alert(_('檔名無效'));
						return L.fs.write(confdir + '/' + fname, '{}').then(function() { location.reload(); });
					}}, _('建立'))
				])
			])
		]);
	},

	// 使用 Promise.all 顯式解析所有模組，這解決了 L.poll.add is not a function
	render: function() {
		return Promise.all([
			L.resolveDefault(L.require('form'), {}),
			L.resolveDefault(L.require('fs'), {}),
			L.resolveDefault(L.require('ui'), {}),
			L.resolveDefault(L.require('uci'), {}),
			L.resolveDefault(L.require('poll'), {})
		]).then(L.bind(function(results) {
			var form = results[0], fs = results[1], ui = results[2], uci = results[3], poll = results[4];
			
			// 將模組掛載到全局 L 以便 checkStatus 等函數調用
			L.ui = ui; L.fs = fs; L.poll = poll; L.uci = uci;

			var m, s, o;
			m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));

			s = m.section(form.TypedSection, '_status', _('服務控制'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				this.checkStatus();
				poll.add(L.bind(this.checkStatus, this), 5); // 這裡直接使用解析後的 poll 對象
				return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee;' }, [
					E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
					E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:#999;' }, _('檢測中...')),
						E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('工作目錄: ')),
						E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
						E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': function() { 
							return fs.exec('/etc/init.d/sing-box', ['restart']).then(L.bind(this.checkStatus, this)); 
						}.bind(this) }, _('重啟服務'))
					])
				]);
			}, this);

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
					return E('div', {}, [ table, E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-top:10px;', 'click': L.ui.createHandlerFn(this, 'handleCreate', confdir) }, _('＋ 新建配置文件')) ]);
				}, this)).catch(function() { return E('div', { 'class': 'alert-message warning' }, _('目錄讀取失敗。')); });
			}, this);

			return m.render();
		}, this));
	}
});
