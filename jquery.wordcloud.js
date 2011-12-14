/*!
 Simple <canvas> Word Cloud
 by timdream
 
 cutomized by HitHot.cc

 usage:
  $('#canvas').wordCloud(settings); // draw word cloud on #canvas.
  $.wordCloudSupported // return true if the browser checks out
  $.miniumFontSize // return minium font size enforced by the browser
 
 available settings
	fontFamily: font list for text.
	gridSize: 8,
	ellipticity: ellipticity of the circle formed by word.
	center: [x,y] of the center of the circle. Set false to use center of canvas.
	drawMask: true to debug mask to show area covered by word.
	maskColor: color of the debug mask.
	maskGridWidth: width of the mask grid border.
	wordColor: color for word, could be one of the following:
		[CSS color value],
		'random-dark', (default)
		'random-light',
		[function(word, weight, fontSize, radius, theta)]
	backgroundColor: background to cover entire canvas or the detect against.
	wait: wait N ms before drawing next word.
	abortThreshold: abort and execute about() when the browser took more than N ms to draw a word. 0 to disable.
	abort: abort handler.
	weightFactor: 
	minSize: minium font size in pixel to draw (default: $.miniumFontSize / 2, larger than that is still look good using bilinear sampling in browser)
	wordList: 2d array in for word list like [['w1', 12], ['w2', 6]]
	clearCanvas: clear canvas before drawing. Faster than running detection on what's already on it.
	fillBox: true will mark the entire box containing the word as filled - no subsequent smaller words can be fit in the gap.
	shape: keyword or a function that represents polar equation r = fn(theta), available keywords:
		'circle', (default)
		'cardioid', (apple or heart shape curve, the most known polar equation)
		'diamond', (alias: 'square'),
		'triangle-forward',
		'triangle', (alias: 'triangle-upright')
		'pentagon',
		'star'
 
    trace mousemove and catch keyword under.
    startCallback: must be function
    finishCallback: must be function
    clickCallback: must be function
    zoomToFit: true / false
    zoomToFitWidthPercentage: 0 to 1
    zoomToFitHeightPercentage: 0 to 1
    fasterGridEmptyChecker: true / false
*/

"use strict";

// http://jsfromhell.com/array/shuffle
Array.prototype.shuffle = function () { //v1.0
	for(var j, x, i = this.length; i; j = parseInt(Math.random() * i), x = this[--i], this[i] = this[j], this[j] = x);
	return this;
};

// setImmediate
if (!window.setImmediate) {
	window.setImmediate = (function () {
		return window.msSetImmediate ||
		window.webkitSetImmediate ||
		window.mozSetImmediate ||
		window.oSetImmediate ||
		// setZeroTimeout: "hack" based on postMessage
		// modified from http://dbaron.org/log/20100309-faster-timeouts
		(function () {
			if (window.postMessage && window.addEventListener) {
				var timeouts = [],
				timerPassed = -1,
				timerIssued = -1,
				messageName = "zero-timeout-message",
				// Like setTimeout, but only takes a function argument.  There's
				// no time argument (always zero) and no arguments (you have to
				// use a closure).
				setZeroTimeout = function (fn) {
					timeouts.push(fn);
					window.postMessage(messageName, "*");
					return ++timerIssued;
				},
				handleMessage = function (event) {
					// Skipping checking event source, retarded IE confused this window object with another in the presence of iframe
					if (/*event.source == window && */event.data == messageName) {
						event.stopPropagation();
						if (timeouts.length > 0) {
							var fn = timeouts.shift();
							fn();
							timerPassed++;
						}
					}
				};

				window.addEventListener("message", handleMessage, true);
	
				window.clearImmediate = function (timer) {
					if (typeof timer !== 'number' || timer > timerIssued) return;
					var fnId = timer - timerPassed - 1;
					timeouts[fnId] = (function () {}); // overwrite the original fn
				};

				// Add the one thing we want added to the window object.
				return setZeroTimeout;
			};
		})() ||
		// fallback
		function (fn) {
			window.setTimeout(fn, 0);
		}
	})();
}

if (!window.clearImmediate) {
	window.clearImmediate = (function () {
		return window.msClearImmediate ||
		window.webkitClearImmediate ||
		window.mozClearImmediate ||
		window.oClearImmediate ||
		// "clearZeroTimeout" is implement on the previous block ||
		// fallback
		function (timer) {
			window.clearTimeout(timer);
		}
	})();
}

(function ($) {
	$.wordCloudSupported = (function () {
		var $c = $('<canvas />'), ctx;
		if (!$c[0] || !$c[0].getContext) return false;
		ctx = $c[0].getContext('2d');
		if (!ctx.getImageData) return false;
		if (!ctx.fillText) return false;
		if (!Array.prototype.some) return false;
		if (!Array.prototype.push) return false;
		if (/opera mini/i.test(window.navigator.userAgent.toLowerCase())) return false;
		if ($.browser.msie && /msie 7\.0/i.test(window.navigator.userAgent.toLowerCase())) return false;
		
		return true;
	}());

	$.miniumFontSize = (function() {
		if (!$.wordCloudSupported) return;

		var lctx = document.createElement('canvas').getContext('2d'),
		size = 20,
		hanWidth,
		mWidth;
		while (size) {
			lctx.font = size.toString(10) + 'px sans-serif';
			if (
				lctx.measureText('\uFF37').width === hanWidth &&
				lctx.measureText('m').width === mWidth
			) return size+1;
			hanWidth = lctx.measureText('\uFF37').width;
			mWidth = lctx.measureText('m').width;

			size--;
		}
		return 0;
	})();

	$.fn.wordCloud = function (options) {
		if (!$.wordCloudSupported) return this;
			
		var settings = {
			adjustX: 0,
			adjustY: 0,
			fontFamily: '"Helvetica Neue",Arial,微軟正黑體,"Microsoft JhengHei","Microsoft YaHei","Lucida Grande","Lucida Sans Unicode",sans-serif',//'"Trebuchet MS", "Heiti TC", "微軟正黑體", "Arial Unicode MS", "Droid Fallback Sans", sans-serif',
			gridSize: 8,
			ellipticity: 0.65,
			center: false,
			drawMask: false,
			maskColor: 'rgba(255,0,0,0.3)',
			maskGridWidth: 0.3,
			wordColor: 'random-dark',
			backgroundColor: 'rgba(0, 0, 0, 0)',//'#fff',  //opaque white = rgba(255, 255, 255, 1)
			wait: 0,
			abortThreshold: 1000, // disabled
			abort: $.noop,
			weightFactor: 1,
			minSize: $.miniumFontSize / 2, // 0 to disable
			wordList: [],
			rotateRatio: 0.1,
			clearCanvas: true,
			fasterGridEmptyChecker: false,
			fillBox: false,
			shape: 'circle',
			finished: false
		};

		if (options) { 
			$.extend(settings, options);
		}

		if (typeof settings.weightFactor !== 'function') {
			var factor = settings.weightFactor;
			settings.weightFactor = function (pt) {
				return pt*factor; //in px
			};
		}
		
		if (typeof settings.shape !== 'function') {
			switch (settings.shape) {
				case 'circle':
				default:
					settings.shape = function (theta) { return 1; };
				break;
				case 'cardioid':
					settings.shape = function (theta) {
						return 1 - Math.sin(theta);
					};
				break;
				/*

				To work out an X-gon, one has to calculate "m", where 1/(cos(2*PI/X)+m*sin(2*PI/X)) = 1/(cos(0)+m*sin(0))
				http://www.wolframalpha.com/input/?i=1%2F%28cos%282*PI%2FX%29%2Bm*sin%282*PI%2FX%29%29+%3D+1%2F%28cos%280%29%2Bm*sin%280%29%29

				Copy the solution into polar equation r = 1/(cos(t') + m*sin(t')) where t' equals to mod(t, 2PI/X);

				*/
				
				case 'diamond':
				case 'square':
					// http://www.wolframalpha.com/input/?i=plot+r+%3D+1%2F%28cos%28mod+%28t%2C+PI%2F2%29%29%2Bsin%28mod+%28t%2C+PI%2F2%29%29%29%2C+t+%3D+0+..+2*PI
					settings.shape = function (theta) {
						var theta_dalta = theta % (2 * Math.PI / 4);
						return 1/(Math.cos(theta_dalta) + Math.sin(theta_dalta));
					};
				break;
				case 'triangle-forward':
					// http://www.wolframalpha.com/input/?i=plot+r+%3D+1%2F%28cos%28mod+%28t%2C+2*PI%2F3%29%29%2Bsqrt%283%29sin%28mod+%28t%2C+2*PI%2F3%29%29%29%2C+t+%3D+0+..+2*PI
					settings.shape = function (theta) {
						var theta_dalta = theta % (2 * Math.PI / 3);
						return 1/(Math.cos(theta_dalta) + Math.sqrt(3)*Math.sin(theta_dalta));
					};
				break;
				case 'triangle':
				case 'triangle-upright':
					settings.shape = function (theta) {
						var theta_dalta = (theta + Math.PI * 3 / 2) % (2 * Math.PI / 3);
						return 1/(Math.cos(theta_dalta) + Math.sqrt(3)*Math.sin(theta_dalta));
					};
				break;
				case 'pentagon':
					settings.shape = function (theta) {
						var theta_dalta = (theta + 0.955) % (2 * Math.PI / 5);
						return 1/(Math.cos(theta_dalta) + 0.726543*Math.sin(theta_dalta));
					};
				break;
				case 'star':
					settings.shape = function (theta) {
						var theta_dalta = (theta + 0.955) % (2 * Math.PI / 10);
						if ((theta + 0.955) % (2 * Math.PI / 5) - (2 * Math.PI / 10) >= 0) {
							return 1/(Math.cos((2 * Math.PI / 10) - theta_dalta) + 3.07768*Math.sin((2 * Math.PI / 10) - theta_dalta));
						} else {
							return 1/(Math.cos(theta_dalta) + 3.07768*Math.sin(theta_dalta));
						}
					};
				break;
			}
		}

		settings.gridSize = Math.max(settings.gridSize, 4);

		var g = settings.gridSize,
			ctx, grid, gridWord, ngx, ngy, diffChannel, bgPixel,
			escapeTime,
			wordColor = function (word, weight, fontSize, radius, theta) {
				switch (settings.wordColor) {
					case 'random-dark':
						return 'rgb('
							+ Math.floor(Math.random()*128).toString(10) + ','
							+ Math.floor(Math.random()*128).toString(10) + ','
							+ Math.floor(Math.random()*128).toString(10) + ')';
					break;
					case 'random-light':
						return 'rgb('
							+ Math.floor(Math.random()*128 + 128).toString(10) + ','
							+ Math.floor(Math.random()*128 + 128).toString(10) + ','
							+ Math.floor(Math.random()*128 + 128).toString(10) + ')';
					break;
					case 'random-normal':
						return 'rgb('
							+ Math.floor(Math.random()*64 + 128).toString(10) + ','
							+ Math.floor(Math.random()*128 + 32).toString(10) + ','
							+ Math.floor(Math.random()*128 + 32).toString(10) + ')';
					break;
					case 'random-impress':
						var cap = Math.floor(Math.random() * 2) + 2;
						var rnd = 1;
						var r,g,b;
						if (Math.floor(Math.random() * 2) > 0 && ++rnd <= cap) {
							r = Math.floor(Math.random()*64 + 128).toString(10);
						}
						else {
							r = Math.floor(Math.random()*32 + 0).toString(10);
						}
						if ((cap - rnd > 1 || Math.floor(Math.random() * 2) > 0) && ++rnd <= cap) {
							g = Math.floor(Math.random()*64 + 128).toString(10);
						}
						else {
							g = Math.floor(Math.random()*32 + 0).toString(10);
						}
						if ((cap - rnd > 0 || Math.floor(Math.random() * 2) > 0) && ++rnd <= cap) {
							b = Math.floor(Math.random()*64 + 128).toString(10);
						}
						else {
							b = Math.floor(Math.random()*32 + 0).toString(10);
						}
						
						return 'rgb('
							+ r + ','
							+ g + ','
							+ b + ')';
					break;
					default:
					if (typeof settings.wordColor !== 'function') {
						return settings.wordColor;
					} else {
						return settings.wordColor(word, weight, fontSize, radius, theta);
					}
				}
			},
			exceedTime = function () {
				return (
					settings.abortThreshold > 0
					&& (new Date()).getTime() - escapeTime > settings.abortThreshold
				);
			},
			getChannelData = function (data, x, y, w, h, c) {
				return data[
					(y*w+x)*4+c
				];
			},
			isGridEmptyFast = function (imgData, gx, gy, gw, gh) {
				var i=gw, j=gh;
				while (i--) {
					if ((gx + i) >= ngx) continue;
					j = gh;
					
					while (j--) {
						if ((gy + j) >= ngy) continue;
						if (typeof(grid[gx+i][gy+j]) != undefined && grid[gx+i][gy+j]) return false;
					}
				}
				
				return true;
			},
			isGridEmpty = function (imgData, x, y, w, h) {
				var i = g, j;
				if (!isNaN(diffChannel)) {
					while (i--) {
						j = g;
						while (j --) {
							if (getChannelData(imgData.data, x+i, y+j, w, h, diffChannel) !== bgPixel[diffChannel]) return false;
						}
					}
				} else {
					var k;
					while (i--) {
						j = g;
						while (j --) {
							k = 4;
							while (k--) {
								if (
									imgData.data[
										((y+j)*w+x+i)*4+k
									] !== bgPixel[k]
								) return false;
							}
						}
					}		
				}
				return true;
			},
			fillGrid = function (gx, gy, gw, gh) {
				var x = gw, y;
				if (settings.drawMask) ctx.fillStyle = settings.maskColor;
				while (x--) {
					y = gh;
					while (y--) {
						grid[gx + x][gy + y] = false;
						if (settings.drawMask) {
							ctx.fillRect((gx + x)*g, (gy + y)*g, g-settings.maskGridWidth, g-settings.maskGridWidth);
						}
					}
				}
			},
			updateGrid = function (wordData) {
				var x = wordData.gw, y;
				if (settings.drawMask) ctx.fillStyle = settings.maskColor;
				/*
				getImageData() is a super expensive function
				(internally, extracting pixels of _entire canvas_ all the way from GPU),
				call once here instead of every time in isGridEmpty
				*/
				var imgData = ctx.getImageData(wordData.gx*g, wordData.gy*g, wordData.gw*g, wordData.gh*g);
				out: while (x--) {
					y = wordData.gh;
					while (y--) {
						if ((settings.fasterGridEmptyChecker && !isGridEmptyFast(imgData, x, y, wordData.gw, wordData.gh)) || !isGridEmpty(imgData, x*g, y*g, wordData.gw*g, wordData.gh*g)) {
							grid[wordData.gx + x][wordData.gy + y] = false;
							gridWord[wordData.gx + x][wordData.gy + y] = wordData;
							
							if (settings.drawMask) {
								ctx.fillRect((wordData.gx + x)*g, (wordData.gy + y)*g, g-settings.maskGridWidth, g-settings.maskGridWidth);
							}
						}
						if (exceedTime()) break out;
					}
				}
			},
			drawShadowEffects = function(ctx, text, w, h, offsetX, offsetY, tw, th, fontSize, blurColor, rotate, mu, highlight) {
				var fc = document.createElement('canvas');
				fc.setAttribute('width', w);
				fc.setAttribute('height', h);
				var fctx = fc.getContext('2d');
				fctx.textBaseline = 'top';
				fctx.font = fontSize.toString(10) + 'px ' + settings.fontFamily;
				
				var blurStep = Math.floor(fontSize / 50);
				
				if (rotate) {
					fctx.translate(0, h);
					fctx.rotate(-Math.PI/2);
				
					// gather information about the height of the font
					var textHeight = tw;
					// loop through text-shadow based effects
					var textWidth = th;

					// just a hack, make the word more vertical centerlized.
					offsetY += (textHeight - fctx.measureText('\uFF37').width) / 2;

					// parse text-shadows from css
					var shadows1 = [
					               {x:0,y:0,blur:blurStep,color:"#fff"},
					               {x:0,y:0,blur:blurStep*2,color:"#fff"},
					               {x:0,y:0,blur:blurStep*5,color:blurColor},
					               {x:0,y:0,blur:blurStep*7,color:blurColor},
					               ]; 
					
					var shadows2 = [
					                {x:-0.03*textHeight,y:0,blur:0,color:"red"},
					                {x:0.03*textHeight,y:0,blur:0,color:"cyan"},
					                ];

					var shadows3 = [
					                {x:0,y:0,blur:blurStep/2,color:blurColor},
					                {x:0,y:0,blur:blurStep,color:blurColor},
					                {x:0,y:0,blur:blurStep*1.5,color:blurColor},
					                ];
					var shadows4 = [
					                {x:0,y:0,blur:blurStep,color:"#232323"},
					                {x:0.01*textHeight,y:0.01*textHeight,blur:blurStep/10,color:"#232323"},
					                ];
										
					var shadows = highlight ? shadows1 : shadows4;
					// loop through the shadow collection
					var n = shadows.length; while(n--) {
						var shadow = shadows[n];
						var totalWidth = textWidth + shadow.blur * 2;
						fctx.save();
						fctx.beginPath();
						fctx.fillStyle = "red";
						fctx.rect(0, 0, textWidth, textHeight);
						fctx.clip();
						if (shadow.blur) { // just run shadow (clip text)
							fctx.shadowColor = shadow.color;
							fctx.shadowOffsetX = shadow.x + totalWidth;
							fctx.shadowOffsetY = shadow.y;
							fctx.shadowBlur = shadow.blur;
							fctx.fillText(text, offsetX, offsetY - totalWidth);
						} else { // just run pseudo-shadow
							fctx.fillStyle = shadow.color;
							fctx.fillText(text, offsetX + (shadow.x||0), offsetY - (shadow.y||0));
						}
						fctx.restore();
					}
					// drawing the text in the foreground
					var grd = fctx.createLinearGradient(offsetX, offsetY, offsetX,  offsetY+textHeight);
						grd.addColorStop(0, "#fff");
						grd.addColorStop(.3, blurColor);
					fctx.fillStyle = blurColor;
					fctx.fillStyle = grd;
					fctx.fillText(text, offsetX, offsetY);
				}
				else {
					// gather information about the height of the font
					var textHeight = th;
					// loop through text-shadow based effects
					var textWidth = tw;
					
					// just a hack, make the word more vertical centerlized.
					offsetY += (textHeight - fctx.measureText('\uFF37').width) / 2;		

					// parse text-shadows from css
					var shadows1 = [
					               {x:0,y:0,blur:blurStep,color:"#fff"},
					               {x:0,y:0,blur:blurStep*2,color:"#fff"},
					               {x:0,y:0,blur:blurStep*5,color:blurColor},
					               {x:0,y:0,blur:blurStep*7,color:blurColor},
					               ]; 
					
					var shadows2 = [
					                {x:-0.03*textHeight,y:0,blur:0,color:"red"},
					                {x:0.03*textHeight,y:0,blur:0,color:"cyan"},
					                ];

					var shadows3 = [
					                {x:0,y:0,blur:blurStep/2,color:blurColor},
					                {x:0,y:0,blur:blurStep,color:blurColor},
					                {x:0,y:0,blur:blurStep*1.5,color:blurColor},
					                ];
					var shadows4 = [
					                {x:0,y:0,blur:blurStep,color:"#232323"},
					                {x:0.01*textHeight,y:0.01*textHeight,blur:blurStep/10,color:"#232323"},
					                ];
					
					var shadows = highlight ? shadows1 : shadows4;
					// loop through the shadow collection
					var n = shadows.length; while(n--) {
						var shadow = shadows[n];
						var totalWidth = textWidth + shadow.blur * 2;
						fctx.save();
						fctx.beginPath();
						fctx.fillStyle = "red";
						fctx.rect(0, 0, textWidth, textHeight);
						fctx.clip();
						if (shadow.blur) { // just run shadow (clip text)
							fctx.shadowColor = shadow.color;
							fctx.shadowOffsetX = shadow.x + totalWidth;
							fctx.shadowOffsetY = shadow.y;
							fctx.shadowBlur = shadow.blur;
							fctx.fillText(text, offsetX - totalWidth, offsetY);
						} else { // just run pseudo-shadow
							fctx.fillStyle = shadow.color;
							fctx.fillText(text, offsetX + (shadow.x||0), offsetY - (shadow.y||0));
						}
						fctx.restore();
					}
					// drawing the text in the foreground
					var grd = fctx.createLinearGradient(offsetX, offsetY, offsetX,  offsetY+textHeight);
						grd.addColorStop(0, "#fff");
						grd.addColorStop(.3, blurColor);
					fctx.fillStyle = blurColor;
					fctx.fillStyle = grd;
					fctx.fillText(text, offsetX, offsetY);
				}
				return fc;
			},
			// For reuse in event 
			drawWord = function(wordData, highlight) {
				var offsetX = (wordData.gw*g - wordData.w)/2, offsetY = (wordData.gh*g - wordData.h)/2;
				var newX = wordData.gx*g + offsetX, newY = wordData.gy*g + offsetY;
				var outW = wordData.gw*g, outH = wordData.gh*g;

				var rndColor = ("color" in wordData) ? wordData.color : wordColor(wordData.word, wordData.weight, wordData.fontSize, wordData.r, wordData.theta);
				$.extend(wordData, {color: rndColor});
					
				if (wordData.mu !== 1 || wordData.rotate) {
					var fc = drawShadowEffects(ctx, wordData.word, outW*wordData.mu, outH*wordData.mu, offsetX, offsetY, wordData.w, wordData.h, wordData.fontSize, rndColor, wordData.rotate, wordData.mu, highlight);
					ctx.drawImage(fc, Math.floor(newX), Math.floor(newY), outW, outH);
				} else {
					ctx.font = wordData.fontSize.toString(10) + 'px ' + settings.fontFamily;
					var fc = drawShadowEffects(ctx, wordData.word, outW, outH, offsetX, offsetY, wordData.w, wordData.h, wordData.fontSize, rndColor, wordData.rotate, wordData.mu, highlight);
					ctx.drawImage(fc, Math.floor(newX), Math.floor(newY), outW, outH);
				}
			},
			putWord = function (word, weight) {
				var gw, gh, mu = 1,
				rotate = (Math.random() < settings.rotateRatio),
				fontSize = settings.weightFactor(weight);
				if (fontSize <= settings.minSize) return false; // fontSize === 0 means weightFactor wants the text skipped.
				if (fontSize < $.miniumFontSize) mu = (function () {  // make sure fillText is not limited by min font size set by browser.
					var mu = 2;
					while (mu*fontSize < $.miniumFontSize) {
						mu += 2; // TBD: should force the browser to do resampling 0.5x each time instead of this
					}
					return mu;
				})();
				ctx.font = (fontSize*mu).toString(10) + 'px ' + settings.fontFamily;
				if (rotate) {
					var h = ctx.measureText(word).width/mu,
						w = Math.max(fontSize*mu, ctx.measureText('m').width, ctx.measureText('\uFF37').width)/mu;
					if (/[Jgpqy]/.test(word)) w *= 3/2;
					w += Math.floor(fontSize/8);
					h += Math.floor(fontSize/8);
				} else {
					var w = ctx.measureText(word).width/mu,
						h = Math.max(fontSize*mu, ctx.measureText('m').width, ctx.measureText('\uFF37').width)/mu;
					if (/[Jgpqy]/.test(word)) h *= 3/2;
					h += Math.floor(fontSize/8);
					w += Math.floor(fontSize/8);
				}
				w = Math.ceil(w);
				h = Math.ceil(h);
				gw = Math.ceil(w/g),
				gh = Math.ceil(h/g);
				var center = (settings.center)?[settings.center[0]/g, settings.center[1]/g]:[ngx/2, ngy/2];
				var R = Math.floor(Math.sqrt(ngx*ngx+ngy*ngy)), T = ngx+ngy, r, t, points, x, y;
				r = R + 1;
				while (r--) {
					t = T;
					points = [];
					while (t--) {
						var rx = settings.shape(t/T*2*Math.PI); // 0 to 1
						points.push(
							[
								Math.floor(center[0]+(R-r)*rx*Math.cos(-t/T*2*Math.PI) - gw/2),
								Math.floor(center[1]+(R-r)*rx*settings.ellipticity*Math.sin(-t/T*2*Math.PI) - gh/2),
								t/T*2*Math.PI
							]
						);
					}
					if (points.shuffle().some(
						function (gxy) {
							if (canFitText(gxy[0], gxy[1], gw, gh)) {
								//word, weight, fontSize, radius, theta, gx, gy, gw, gh, w, h, mu, rotate
								var wordData = {word:word, weight:weight, fontSize:fontSize, r:R-r, theta:gxy[2], gx:gxy[0], gy:gxy[1], gw:gw, gh:gh, w:w, h:h, mu:mu, rotate:rotate};
								drawWord(wordData, false);
								updateGrid(wordData);
								return true;
							}
							return false;
						}
					)) return true;
				}
				return false;
			},
			canFitText = function (gx, gy, gw, gh) {
				if (gx < 0 || gy < 0 || gx + gw > ngx || gy + gh > ngy) return false;
				var x = gw, y;
				while (x--) {
					y = gh;
					while (y--) {
						if (!grid[gx + x][gy + y]) return false;
					}
				}
				return true;
			};

		/*
		 When mouse moving, try to find out which word under cursor.
		 The putImageData(img, x, y, h, w) function only works in Firefox.
		 But use putImageData(img, x, y) works in both Firefox, Chrome & IE9.
		 */
		var lastImageData = false, lastGx = false, lastGy = false;
		this.mousemove(function(e) {
			if (!settings.finished) return;
			var xMousePos, yMousePos, xMousePosMax, yMousePosMax;

			if (document.layers) {
				xMousePos = e.pageX;
				yMousePos = e.pageY;
				xMousePosMax = window.innerWidth+window.pageXOffset;
				yMousePosMax = window.innerHeight+window.pageYOffset;
			} else if (document.all) {
				xMousePos = window.event.x+document.body.scrollLeft;
				yMousePos = window.event.y+document.body.scrollTop;
				xMousePosMax = document.body.clientWidth+document.body.scrollLeft;
				yMousePosMax = document.body.clientHeight+document.body.scrollTop;
			} else if (document.getElementById) {
				xMousePos = e.pageX;
				yMousePos = e.pageY;
				xMousePosMax = window.innerWidth+window.pageXOffset;
				yMousePosMax = window.innerHeight+window.pageYOffset;
			}

			var x,y;
			x = xMousePos + settings.adjustX();
			y = yMousePos + settings.adjustY();
			
			var gx = Math.ceil(x/g);
			var gy = Math.ceil(y/g);
			
			if (lastImageData) {
				var ww = gridWord[lastGx][lastGy];
				ctx.putImageData(lastImageData, (ww.gx-0)*g, (ww.gy-0)*g);
				lastImageData = false;
			}
			
			if (gridWord[gx][gy]) {
				var ww = gridWord[gx][gy];
				lastImageData = ctx.getImageData((ww.gx-0)*g, (ww.gy-0)*g, (ww.gw+0)*g, (ww.gh+0)*g);
				lastGx = gx; 
				lastGy = gy;
				drawWord(ww, true);
			}
		});
		this.click(function(e) {
			var xMousePos, yMousePos, xMousePosMax, yMousePosMax;

			if (document.layers) {
				xMousePos = e.pageX;
				yMousePos = e.pageY;
				xMousePosMax = window.innerWidth+window.pageXOffset;
				yMousePosMax = window.innerHeight+window.pageYOffset;
			} else if (document.all) {
				xMousePos = window.event.x+document.body.scrollLeft;
				yMousePos = window.event.y+document.body.scrollTop;
				xMousePosMax = document.body.clientWidth+document.body.scrollLeft;
				yMousePosMax = document.body.clientHeight+document.body.scrollTop;
			} else if (document.getElementById) {
				xMousePos = e.pageX;
				yMousePos = e.pageY;
				xMousePosMax = window.innerWidth+window.pageXOffset;
				yMousePosMax = window.innerHeight+window.pageYOffset;
			}

			var x,y;
			x = xMousePos + settings.adjustX();
			y = yMousePos + settings.adjustY();
			
			var gx = Math.ceil(x/g);
			var gy = Math.ceil(y/g);
			
			if (gridWord[gx][gy] && typeof settings.clickCallback == 'function') {
				settings.clickCallback(gridWord[gx][gy].word);
			}

		});		

		return this.each(function() {
			if (this.nodeName.toLowerCase() !== 'canvas') return;

			var $el = $(this);
			
			if (!(settings.zoomToFit === undefined) && settings.zoomToFit) {
				var newWidth, newHeight;
				
				if (settings.zoomToFitWidthPercetage === undefined) {
					$el.attr('width', Math.floor(window.innerWidth * 1));
				}
				else {
					$el.attr('width', Math.floor(window.innerWidth * settings.zoomToFitWidthPercetage));
				}
				
				if (settings.zoomToFitHeightPercetage === undefined) {
					$el.attr('height', Math.floor(window.innerHeight * 1));
				}
				else {
					$el.attr('height', Math.floor(window.innerHeight * settings.zoomToFitHeightPercetage));
				}
			}

			if (typeof settings.startCallback == 'function') {
				settings.startCallback();
			}
			
			ngx = Math.floor($el.attr('width')/g);
			ngy = Math.floor($el.attr('height')/g);
			ctx = this.getContext('2d'), 
			grid = [];
			gridWord = []; // for store word occupy which grid

			/* in order to get more a correct reading on difference,
			 do clearRect */

			var bctx = document.createElement('canvas').getContext('2d');

			bctx.fillStyle = settings.backgroundColor;
			bctx.clearRect(0, 0, 1, 1);
			bctx.fillStyle = settings.backgroundColor;
			bctx.fillRect(0, 0, 1, 1);
			bgPixel = bctx.getImageData(0, 0, 1, 1).data;
			
			if (typeof settings.wordColor !== 'function'
				&& settings.wordColor.substr(0,6) !== 'random') {
				bctx.fillStyle = settings.wordColor;
				bctx.fillRect(0, 0, 1, 1);
				var wdPixel = bctx.getImageData(0, 0, 1, 1).data;
	
				var i = 4;
				while (i--) {
					if (Math.abs(wdPixel[i] - bgPixel[i]) > 10) {
						diffChannel = i;
						break;
					}
				}
			} else {
				diffChannel = NaN;
			}
			
			//delete bctx; // break in strict mode

			var x = ngx, y;
			while (x--) {
				grid[x] = [];
				gridWord[x] = [];
				y = ngy;
				while (y--) {
					grid[x][y] = true;
					gridWord[x][y] = false;
				}
			}

			if (settings.clearCanvas) {
				ctx.fillStyle = settings.backgroundColor;
				ctx.clearRect(0, 0, ngx*(g+1), ngy*(g+1));
				ctx.fillRect(0, 0, ngx*(g+1), ngy*(g+1));
			} else {
				updateGrid({gx:0, gy:0, gw:ngx, gh:ngy});
			}


			ctx.textBaseline = 'top';

			// cancel previous wordcloud action by trigger
			$el.trigger('wordcloudstart');
			
			var i = 0;
			var stop = false;
			if (settings.wait !== 0) {
				var timer = setInterval(
					function () {
						if (i >= settings.wordList.length) {
							clearTimeout(timer);
							$el.trigger('wordcloudstop');
							// console.log(d.getTime() - (new Date()).getTime());
							
							if (typeof settings.finishCallback == 'function') {
								settings.finishCallback();
							}
							settings.finished = true;
							return;
						}
						if (stop) {
							if (typeof settings.finishCallback == 'function') {
								settings.finishCallback();
							}
							settings.finished = true;
							return;
						}
						escapeTime = (new Date()).getTime();
						putWord(settings.wordList[i][0], settings.wordList[i][1]);
						if (exceedTime()) {
							clearTimeout(timer);
							settings.abort();
							$el.trigger('wordcloudabort');
							$el.trigger('wordcloudstop');
	
							if (typeof settings.finishCallback == 'function') {
								settings.finishCallback();
							}
							settings.finished = true;
						}
						i++;
					},
					settings.wait
				);
			} else {
				window.setImmediate(
					function loop() {
						if (i >= settings.wordList.length) {
							// console.log(d.getTime() - (new Date()).getTime());
							$el.trigger('wordcloudstop');
	
							if (typeof settings.finishCallback == 'function') {
								settings.finishCallback();
							}
							settings.finished = true;
							return;
						}
						if (stop) {
							if (typeof settings.finishCallback == 'function') {
								settings.finishCallback();
							}
							settings.finished = true;
							return;
						}
						escapeTime = (new Date()).getTime();
						putWord(settings.wordList[i][0], settings.wordList[i][1]);
						if (exceedTime()) {
							settings.abort();
							$el.trigger('wordcloudabort');
							$el.trigger('wordcloudstop');
	
							if (typeof settings.finishCallback == 'function') {
								settings.finishCallback();
							}
							settings.finished = true;
							return;
						}
						i++;
						window.setImmediate(loop);
					}
				);
			}
			$el.one(
				'wordcloudstart',
				function (ev) {
					clearTimeout(timer);
				}
			);
			$el.one(
					'wordcloudstop',
					function () {
						stop = true;
					}
				);
		});
	}
})(jQuery);
