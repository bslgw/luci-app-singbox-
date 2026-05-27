'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';
'import poll';

return L.view.extend({
	// 自定義錯誤大彈窗 (僅用於報錯)
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

	// 核心：應用配置與重啟服務
	handleSwitch: function(filename, confdir, ev) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		var btn = ev.target;
		var oldText = btn.textContent;

		// 視覺反饋：按鈕進入載入狀態
		btn.disabled = true;
		btn.textContent = _('正在應用...');
		btn.style.background = '#ffc107';

		// 1. 讀取 2. 寫入 3. 強力重啟 (restart 不行就 stop + start)
		return L.fs.read(source).then(function(content) {
			return L.fs.write(target, content);
		}).then(function() {
			// 執行重啟組合拳
			return L.fs.exec('/etc/init.d/sing-box', ['restart']).then(function(res) {
				if (res.code !== 0) return L.fs.exec('/etc/init.d/sing-box', ['stop']).then(function() {
					return L.fs.exec('/etc/init.d/sing-box', ['start']);
				});
			});
		}).then(L.bind(function() {
			btn.textContent = _('完成');
			btn.style.background = '#28a745';
			setTimeout(function() {
				btn.disabled = false;
				btn.textContent = oldText;
				btn.style.background = '';
			}, 2000);
			this.checkStatus();
		}, this)).catch(L.bind(function(e) {
			btn.disabled = false;
			btn.textContent = oldText;
			btn.style.background = '';
			this.showError(_('切換失敗：%s').format(e.message || e));
		}, this));
	},

	handleEdit: function(filename, confdir) {
		var path = confdir + '/' + filename;
		// 修正：處理 NoDataError (空檔案)
		return L.fs.read(path).catch(function(e) {
			if (e.message && e.message.indexOf('NoDataError') !== -1) return '';
			throw e;
		}).then(L.bind(function(content) {
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
			this.showError(_('無法讀取檔案：%s').format(e));
		}, this));
	},

	render: function() {
		return Promise.all([ L.require('form'), L.require('fs'), L.require('ui'), L.require('uci'), L.require('poll') ]).then(L.bind(function(results) {
			var form = results, fs = results, ui = results, uci = results, poll = results;
			L.ui = ui; L.fs = fs;

			var m = new form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));
			var s = m.section(form.TypedSection, '_status', _('服務控制'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				this.checkStatus();
				poll.add(L.bind(this.checkStatus, this), 5);
				return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center;' }, [
					E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
					E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
						E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:#999;' }, _('檢測中...')),
						E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('工作目錄: ')),
						E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
						E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': function(ev) {
							var b = ev.target; b.textContent = _('正在重啟...');
							return L.fs.exec('/etc/init.d/sing-box', ['restart']).then(L.bind(function(){
								b.textContent = _('重啟服務');
								this.checkStatus();
							}, this));
						}.bind(this) }, _('重啟服務'))
					])
				]);
			}, this);

			s = m.section(form.TypedSection, '_list', _('可用配置檔案'));
			s.anonymous = true;
			s.render = L.bind(function() {
				var confdir = uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
				return fs.list(confdir).then(L.bind(function(files) {
					var table = E('table', { 'class': 'table cbi-section-table' }, [
						E('tr', { 'class': 'tr cbi-section-table-titles' }, [
							E('th', { 'class': 'th' }, _('檔案名稱')),
							E('th', { 'class': 'th', 'style': 'width:240px; text-align:center;' }, _('操作'))
						])
					]);
					files.forEach(L.bind(function(file) {
						if (file.name.endsWith('.json') && file.name !== 'config.json') {
							table.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td', 'style': 'vertical-align:middle;' }, file.name),
								E('td', { 'class': 'td', 'style': 'white-space:nowrap; text-align:center;' }, [
									E('button', { 'class': 'btn cbi-button-apply', 'style': 'margin:0 2px;', 'click': L.bind(this.handleSwitch, this, file.name, confdir) }, _('選用')),
									E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin:0 2px;', 'click': L.bind(this.handleEdit, this, file.name, confdir) }, _('編輯')),
									E('button', { 'class': 'btn cbi-button-remove', 'style': 'margin:0 2px;', 'click': function() {
										if (confirm(_('刪除 %s？').format(file.name))) L.fs.remove(confdir + '/' + file.name).then(function(){ location.reload() });
									} }, _('刪除'))
								])
							]));
						}
					}, this));
					return E('div', {}, [
						table,
						E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-top:10px;', 'click': function() {
							var name = prompt(_('請輸入新檔名 (.json):'));
							if (name && name.endsWith('.json')) L.fs.write(confdir + '/' + name, '{}').then(function(){ location.reload() });
						} }, _('＋ 新建配置'))
					]);
				}, this)).catch(function() { return E('div', { 'class': 'alert-message warning' }, _('讀取目錄失敗。')); });
			}, this);

			return m.render();
		}, this));
	}
});
