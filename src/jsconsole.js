/**
 * @license
 * Copyright (C) 2013 Steven Berry (http://www.sberry.me/jsconsole)
 * Licensed: MIT (http://opensource.org/licenses/mit-license.php)
 * License Stipulations:
 *     1) Retain this comment block.
 *     2) Send me an email if you use this and have questions/comments!
 * 
 * Steven Berry
 * www.sberry.me
 * steven@sberry.me
 */

(function(window, $, undefined) {
	var instance;
	
	var CLS_HIDE = 'jsc-hide';
	var CLS_MULTILINE = 'jsc-multiline';
	var CLS_RESIZABLE = 'jsc-resizable';
	var CLS_TRANSPARENT = 'jsc-translucent';
	var RE_NEWLINE = /\r\n|\r|\n/;
	var RE_PREV_INDENT = /[.|\r\n|\r|\n|^t|^ ]*([\t ]*).*[\r\n|\r|\n]?$/;
	
	if (typeof prettyPrintOne === 'undefined') {
		prettyPrintOne = function(d) { return d; };
	}
	
	var keybind = (function() {
		var bindings = {};
		
		function getKeyString(e) {
			var combo = [e.which];
			
			if (e.shiftKey) { combo.unshift('SHIFT'); }
			if (e.altKey) { combo.unshift('ALT'); }
			if (e.ctrlKey) { combo.unshift('CTRL'); }
			
			return combo.join('+');
		}
		
		function bindKey(sequence, fn) {
			if ($.isFunction(fn)) {
				bindings[sequence] = fn;
			}
		}
		
		$(window).bind('keydown', function(e) {
			var action, combo, flag;
			
			if (e.which !== 16 && e.which !== 17 && e.which !== 18) {
				combo = getKeyString(e);
				action = bindings[combo];
				
				if ($.isFunction(action)) {
					flag = action(e);
					
					if (flag === true) {
						e.preventDefault();
					}
					
					return flag;
				}
			}
			
			return true;
		});
		
		return function(sequence, fn) {
			if ($.isPlainObject(sequence)) {
				$.each(sequence, function(key, value) {
					bindKey(key, value);
				});
			}
			else {
				bindKey(sequence, fn);
			}
		};
	})();
	
	var escapeHTML = (function() {
		var entityMap = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;',
			'/': '&#x2F;'
		};
		
		return function(string) {
			return String(string).replace(/[&<>"'\/]/g, function (s) {
				return entityMap[s];
			});
		};
	})();
	
	var stringify = (function() {
		function sort(a, b) {
			return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
		}
		
		function stringify(obj, visited) {
			var i, prop, parts, names, type;
			
			type = Object.prototype.toString.call(obj)
			
			if (type === '[object global]') {
				return type;
			}
			
			if (obj === undefined || obj === null) {
				return obj + '';
			}
			
			// Check for circular references
			for (i = 0; i < visited.length; i++) {
				if (obj === visited[i]) {
					return '[circular]';
				}
			}
			
			if (typeof obj === 'string') {
				return '"' + obj.replace(/"/g, '\\"') + '"';
			}
			
			if (typeof obj === 'function') {
				return '[object Function]';
			}
			
			if (Array.isArray(obj)) {
				parts = [];
				
				for (i = 0; i < obj.length; i++) {
					parts.push(stringify(obj[i], visited));
				}
				
				return '[' + parts.join(', ') + ']';
			}
			
			if (typeof obj === 'object') {
				names = [];
				parts = [];
				
				visited.push(obj);
				
				for (prop in obj) {
					names.push(prop);
				}
				
				names.sort(sort);
				
				for (i = 0; i < names.length; i++) {
					parts.push(stringify(names[i], visited) + ': ' + stringify(obj[names[i]], visited));
				}
				
				return '{' + parts.join(', ') + '}';
			}
			
			return obj + '';
		}
		
		return function(str) {
			return escapeHTML(stringify(str, []));
		}
	})();
	
	var sysCommands = {
		clear: function(cmd) {
			$(this.output).empty();
			
			return this;
		},
		
		reset: function(cmd) {
			initSandbox.call(this);
			
			return this.info('Variables reset.');
		},
		
		purge: function(cmd) {
			this.history.length = 0;
			
			return this.info('History cleared.');
		},
		
		load: (function() {
			var libraries = {
				jquery: 'http://code.jquery.com/jquery-latest.min.js',
				arrx: 'http://static.sberry.me/scripts/arrx-latest.js'
			};
			
			return function(cmd /* , url_array */) {
				var i, doc;
				
				doc = this.frame.contentDocument || this.frame.contentWindow.document;
				
				for (i = 1; i < arguments.length; i++) {
					(function(consoleInst, url) {
						var script = document.createElement('script');
						script.src = url
						
						script.onload = function() {
							consoleInst.info('Loaded script from `' + url + '`');
							script.onload = null;
							script.onerror = null;
						};
						
						script.onerror = function() {
							consoleInst.error('Failed to load script from `' + url + '`');
							script.onload = null;
							script.onerror = null;
						};
						
						doc.body.appendChild(script);
					})(this, libraries[arguments[i]] || arguments[i]);
				}
				
				return this;
			};
		})(),
		
		help: (function() {
			var helpFile = [
				':help       &ndash; Display help information.',
				':load &lt;url&gt; &ndash; Load external JS file.',
				':clear      &ndash; Clear the console.',
				':purge      &ndash; Clear command history.',
				':reset      &ndash; Clear all sandboxed variables.',
				'',
				'~ &ndash; Toggle console visibility.',
				'CTRL + SHIFT + &uarr; &ndash; Change console mode (single or multi-line).',
				'ENTER &ndash; Run a single-line command.',
				'CTRL + ENTER &ndash; Run a multi-line command.'
				//'CTRL + ALT + T -- Toggle console translucency.'
			];
			
			return function(cmd) {
				return this.info(helpFile.join('\n'));
			};
		})()
	};
	
	function initSandbox() {
		//var doc;
		
		$(this.frame).remove();
		$(this.elem).append('<iframe id="jsc-frame"></iframe>');
		this.frame = $('#jsc-frame').get(0);
		this.sandbox = this.frame.contentWindow;
		
		this.sandbox.eval('for (var key in window.top.__jsconsole__) { console[key] = window.top.__jsconsole__[key]; }');
		//doc = frame.contentDocument || frame.contentWindow.document;
		//doc.body.appendChild($('<script type="text/javascript">(function() { console.log = window.top.__wconsole__.log; })();</script>').get(0));
	}
	
	function bind(fn, thisArg) {
		return function() {
			fn.apply(thisArg, arguments);
		};
	}
	
	function isMultiline(txt) {
		return RE_NEWLINE.test(txt);
	}
	
	function Command(text, multiline) {
		multiline = (typeof multiline === 'boolean') ? multiline : false;
		
		this.text = $.trim(text);
		this.multiline = (this.text.length === 0) ? false : multiline;
	}
	
	function Console() {
		Object.defineProperty(window.top, '__jsconsole__', {
			value: {
				log: bind(this.log, this),
				info: bind(this.info, this),
				warn: bind(this.warn, this),
				error: bind(this.error, this)
			}
		});
		
		$(document.body).append('<div id="jsc-console" class="jsc-hide jsc-flex jsc-column"></div>');
		this.elem = $('#jsc-console').get(0);
		
		$(this.elem).append('<textarea id="jsc-input" spellcheck="false" class="jsc-flexlock"></textarea>');
		this.input = $('#jsc-input').get(0);
		this.input._loadHeight = $(this.input).outerHeight();
		
		$(this.elem).append('<ul id="jsc-output"></ul>');
		this.output = $('#jsc-output').get(0);
		
		// Loads:
		//   this.frame
		//   this.sandbox
		// While retaining usability for the `:reset` command
		initSandbox.call(this);
		
		this.history = [];
		this.history._index = 0;
		this.history._unrun = null;
		
		this.hidden = true;
		this.multiline = false;
	}
	
	Console.prototype = {
		run: function(cmd) {	
			var args, success = true, fn, stripped;
			
			cmd = $.trim(cmd);
			
			if (cmd.length === 0) {
				return;
			}
			
			if (cmd.charAt(0) === ':') {
				args = cmd.split(' ').filter(function(d) { return d.length > 0; });
				stripped = args[0].slice(1);
				fn = sysCommands[stripped];
				
				if ($.isFunction(fn)) {
					this.echo(cmd);
					fn.apply(this, args);
				}
				else {
					this.error('Invalid command.');
				}
			}
			else {
				try {
					this.echo(cmd);
					this.response(cmd);
				}
				catch (ex) {
					this.error(ex.toString());
					success = false;
				}
			}
			
			if (success) {
				this.pushHistory(cmd);
				$(this.input).val('');
			}
		},
		
		post: function(output, type) {
			var $output = $(this.output);
			
			$output.append('<li class="jsc-' + type + '">' + output + '</li>')
				.scrollTop($output[0].scrollHeight);
			
			return this;
		},
		
		echo: function(cmd) {
			return this.post(cmd, 'echo');
		},
		
		response: function(code) {
			var result, display;
			
			result = this.sandbox.eval(code);
			display = stringify(result);
			display = prettyPrintOne(display);
			
			return this.post(display, 'response');
		},
		
		log: function(obj) {
			var count, text, $latest;
			
			text = stringify(obj);
			$latest = $(this.output).find('li.jsc-log').last();
			
			if ($latest.is(':last-child') && escapeHTML($latest.text()) === text) {
				count = parseInt($latest.attr('data-count'));
				$latest.attr('data-count', $.isNumeric(count) ? count + 1 : 2);
			}
			else {
				this.post(stringify(obj), 'log');
			}
		},
			
		info: function(obj) {
			this.post(obj.toString(), 'info');
		},
		
		warn: function(obj) {
			this.post(obj.toString(), 'warn');
		},
		
		error: function(obj) {
			this.post(obj.toString(), 'error');
		},
		
		saveHistory: function() {
			var history = this.history;
			
			if (history._unrun === null) {
				history._unrun = new Command($(this.input).val(), this.multiline);
			}
		},
		
		pushHistory: function(cmd) {
			var history = this.history, item;
			
			item = history[history.length - 1];
			
			if (typeof item === 'undefined' || item.text !== cmd || item.multiline !== this.multiline) {
				history.push(new Command(cmd, this.multiline));
				history._unrun = null;
				history._index = history.length;
			}
		},
		
		nextHistory: function() {
			var history = this.history, item;
			
			this.saveHistory();
			
			if (history._index < history.length) {
				history._index++;
			}
			
			if (history._index === history.length) {
				item = history._unrun;
				history._unrun = null;
			}
			else {
				item = history[history._index];
			}
			
			$(this.input).val(item.text);
			this.toggleMode(!item.multiline);
		},
		
		prevHistory: function() {
			var history = this.history, item;
			
			this.saveHistory();
			
			if (history._index > 0) {
				history._index--;
			}
			
			item = history[history._index];
			
			if (typeof item !== 'undefined') {			
				$(this.input).val(item.text);
				this.toggleMode(!item.multiline);
			}
		},
		
		toggleDisplay: function(flag) {
			var $console = $(this.elem), $input = $(this.input);
			
			if ($console.hasClass(CLS_HIDE) || flag === true) {
				$console.removeClass(CLS_HIDE);
				this.hidden = false;
				$input.focus();
			}
			else {
				$console.addClass(CLS_HIDE);
				this.hidden = true;
				$input.blur();
			}
		},
		
		toggleMode: function(flag) {
			var $input = $(this.input);
			
			if (typeof flag === 'undefined') {
				flag = this.multiline;
			}
			
			if (flag === true) {
				$input.css('height', this.input._loadHeight).removeClass(CLS_MULTILINE + ' ' + CLS_RESIZABLE);
				this.multiline = false;
			}
			else {
				$input.css('height', '50%').addClass(CLS_MULTILINE);
				this.multiline = true;
			}
		},
		
		toggleResizable: function() {			
			if (this.multiline) {
				$(this.input).toggleClass(CLS_RESIZABLE);
			}
		},
		
		toggleTransparency: function(flag) {
			$(this.elem).toggleClass(CLS_TRANSPARENT);
		}
	};
	
	
	$.jsconsole = function() {
		if (instance instanceof Console) {
			return instance;
		}
		
		instance = new Console();
		
		var tabKeyPress = $.Event('keydown');
		tabKeyPress.which = tabKeyPress.keyCode = 9;
		
		var spaceKeyPress = $.Event('keydown');
		spaceKeyPress.which = spaceKeyPress.keyCode = 32;
		
		$(instance.input).bind('keydown', function(e) {
			var i, arr, end, indented = '', start, $this, val;
			
			if (e.which == 9 && instance.multiline) {
				e.preventDefault();
				
				$this = $(this);
				val = $this.val();
				
				start = this.selectionStart;
				end = this.selectionEnd;
				
				if (start === end) {
					$this.val(val.substring(0, start) + '\t' + val.substring(end));
					
					this.selectionStart = this.selectionEnd = start + 1;
				}
				else {
					arr = val.substring(start, end).split(RE_NEWLINE);
					
					if (e.shiftKey) {
						for (i = 0; i < arr.length; i++) {
							indented += arr[i].replace(/\t/, '') + '\n';
						}
					}
					else {
						for (i = 0; i < arr.length; i++) {
							indented += '\t' + arr[i] + '\n';
						}
					}
					
					indented = indented.replace(/\n$/, '');
					
					$this.val(val.substring(0, start) + indented + val.substring(end));
					
					this.selectionStart = start;
					this.selectionEnd = start + indented.length;
				}
			}
		});
		
		$(instance.input).bind('keyup', function(e) {
			var i, end, match, start, val, $this;
			
			if (e.which == 13 && !e.ctrlKey && instance.multiline) {
				e.preventDefault();
				
				$this = $(this);
				val = $this.val();
				
				start = this.selectionStart;
				end = this.selectionEnd;
				
				match = RE_PREV_INDENT.exec(val.substring(0, start))[1];
				
				for (i = 0; i < match.length; i++) {
					if (/\t/.test(match[i])) {
						$this.trigger(tabKeyPress);
					}
					else if (/ /.test(match[i])) {
						$this.trigger(spaceKeyPress);
					}
				}
				
				//$this.val(val.substring(0, start) + match + val.substring(start));
				//this.selectionStart = this.selectionEnd = end + match.length;
			}
		});
		
		// Control keybindings
		keybind({
			// Toggle console display
			'192': function(e) {
				instance.toggleDisplay();
				
				return true;
			},
			
			// Toggle input mode (single-line or multi-line)
			'CTRL+SHIFT+38': function(e) {
				var $input = $(instance.input);
				
				if ($input.is(':focus')) {
					if (instance.multiline && isMultiline($input.val())) {
						instance.info('Cannot switch to single-line mode while editing multi-line code.');
						
						return false;
					}
					
					instance.toggleMode();
					
					return true;
				}
			},
			
			// Toggle console transparency
			'CTRL+ALT+84': function(e) {
				if (!instance.hidden) {
					instance.toggleTransparency();
					
					return true;
				}
			}
		});
		
		// Multi-line mode commands
		keybind({
			// Unlock multi-line input resizing
			'CTRL+SHIFT+40': function(e) {
				if ($(instance.input).is(':focus')) {
					instance.toggleResizable();
					
					return true;
				}
			},
			
			// Previous history item
			'CTRL+38': function(e) {
				if ($(instance.input).is(':focus')) {
					instance.prevHistory();
					
					return true;
				}
			},
			
			// Next history item
			'CTRL+40': function(e) {
				if ($(instance.input).is(':focus')) {
					instance.nextHistory();
					
					return true;
				}
			},
			
			// Execute code
			'CTRL+13': function(e) {
				var $input = $(instance.input);
				
				if ($input.is(':focus')) {
					instance.run($input.val());
					
					return true;
				}
			}
		});
		
		keybind({
			// Previous history item
			'38': function(e) {
				if ($(instance.input).is(':focus') && !instance.multiline) {
					instance.prevHistory();
					
					return true;
				}
			},
			
			// Next history item
			'40': function(e) {
				if ($(instance.input).is(':focus') && !instance.multiline) {
					instance.nextHistory();
					
					return true;
				}
			},
			
			// Execute code
			'13': function(e) {
				var $input = $(instance.input);
				
				if ($input.is(':focus') && !instance.multiline) {
					instance.run($input.val());
					
					return true;
				}
			}
		});
		
		return instance;
	};
	
	$.jsconsole.isMultiline = isMultiline;
	$.jsconsole.keybind = keybind;
})(window, jQuery);