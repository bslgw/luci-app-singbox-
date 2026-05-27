'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 強力重啟組合拳
	doRestart: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['stop']).then(function() {
			return L.fs.exec('/etc/init.d/sing-box', ['start']);
		});
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

	handleSwitch: function(filename, confdir, ev) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		var btn = ev.target;
		var oldText = btn.textContent;
		
		btn.disabled = true; btn.textContent = _('正在應用...'); btn.style.background = '#ffc107';

		return L.fs.read(source).then(function(content) {
			return L.fs.write(target, content || '{}');
		}).then(L.bind(function() {
			// 改用強力重啟
			return this.doRestart();
		}, this)).then(L.bind(function() {
			btn.textContent = _('完成'); btn.style.background = '#28a745';
			setTimeout(L.bind(function() { 
				btn.disabled = false; btn.textContent = oldText; btn.style.background = ''; 
				this.checkStatus();
			}, this), 2000);
		}, this)).catch(L.bind(function(e) {
			btn.disabled = false; btn.textContent = oldText; btn.style.background = '';
			L.ui.showModal(_('出錯'), [E('p', _('操作失敗: %s').format(e.message || e)), E('button', {'class':'btn','click':L.ui.hideModal},_('關閉'))]);
		}, this));
	},

	render: function() {
		return Promise.all([
			L.require('ui'), L.require('fs'), L.require('form'), L.require('uci'), L.require('poll')
		]).then(L.bind(function(res) {
			var ui_mod = res[0], fs_mod = res[1], form_mod = res[2], uci_mod = res[3], poll_mod = res[4];
			L.ui = ui_mod; L.fs = fs_mod;

			var m = new form_mod.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));

			var s = m.section(form_mod.TypedSection, '_status', _('服務控制'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci_mod.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				this.checkStatus();
				poll_mod.add(L.bind(this.checkStatus, this), 5);
				return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
					E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
					E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:#999;' }, _('檢測中...')),
						E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('目錄: ')),
						E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
						E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': L.bind(function(ev) {
							var b = ev.target; b.textContent = _('正在重啟...');
							return this.doRestart().then(L.bind(function(){
								b.textContent = _('重啟服務'); this.checkStatus();
							}, this));
						}, this) }, _('重啟服務'))
					])
				]);
			}, this);

			s = m.section(form_mod.TypedSection, '_list', _('可用配置文件'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci_mod.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				return fs_mod.list(confdir).then(L.bind(function(files) {
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
									E('button', { 'class': 'btn cbi-button-apply', 'style': 'margin:0 2px;', 'click': L.bind(this.handleSwitch, this, file.name, confdir) }, _('選用')),
									E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin:0 2px;', 'click': function() {
										fs_mod.read(confdir + '/' + file.name).catch(function(){ return ''; }).then(function(c) {
											var ta = E('textarea', { 'style': 'width:100%; height:400px; font-family:monospace;' }, [ c || '{}' ]);
											ui_mod.showModal(_('編輯: %s').format(file.name), [ E('div', { 'style': 'padding:10px' }, [ ta, E('div', { 'class': 'right', 'style': 'margin-top:10px' }, [
												E('button', { 'class': 'btn', 'click': ui_mod.hideModal }, _('取消')),
												E('button', { 'class': 'btn cbi-button-positive', 'style': 'margin-left:10px', 'click': function() {
													fs_mod.write(confdir + '/' + file.name, ta.value).then(function() { ui_mod.hideModal(); });
												}}, _('儲存'))
											]) ]) ]);
										});
									} }, _('編輯')),
									E('button', { 'class': 'btn cbi-button-remove', 'style': 'margin:0 2px;', 'click': function() {
										if (confirm(_('刪除 %s？').format(file.name))) fs_mod.remove(confdir + '/' + file.name).then(function(){ location.reload(); });
									} }, _('刪除'))
								])
							]));
						}
					}, this));
					return E('div', {}, [ 
						table, 
						E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-top:10px;', 'click': L.bind(function() {
							var name = prompt(_('新檔名 (.json):'));
							if (name && name.endsWith('.json')) {
								// 關鍵修正：在寫入前先嘗試執行一次指令確保目錄可寫，並強制刷新頁面
								return fs_mod.exec('/bin/touch', [confdir + '/' + name]).then(function() {
									return fs_mod.write(confdir + '/' + name, '{}');
								}).then(function() {
									location.reload();
								}).catch(function(err) {
									alert(_('建立失敗: ') + err);
								});
							}
						}, this) }, _('＋ 新建配置')) 
					]);
				}, this));
			}, this);

			return m.render();
		}, this));
	}
});
