/**
 * いまいる場所から（/nearby/）
 * 「ここから巡る」→ 位置情報 → ① 近くの行き先（REST editplus/v1/nearby が行のHTMLを返す）
 *                              → ② 診断（quiz.js の epQuizMount に座標を渡す）
 *
 * 位置情報の許可は**ボタンを押したときに初めて**聞く。開いただけでダイアログを出すと、
 * 何に使うのか分からないまま断られ、ブラウザはその判断を覚えてしまう。
 *
 * 取れたら見開きのFVを畳み（.nearby-fv--done）、空いた場所に
 * 「河原町・烏丸のあたり ・ 8件 徒歩2〜6分」を出す。**どこにいると受け取ったかを名乗る**ため。
 * 以前は取得の成否が画面のどこにも出ず、結果が正しいのか確かめようがなかった
 * → 60_デザイン/2026-09-17_現在地から探す画面のデザイン監査.md
 */
(function () {
	'use strict';

	var T = window.epQuizI18n || {};
	var t = function (key, fallback) { return T[key] || fallback; };

	var fv = document.getElementById('nearbyFv');
	var btn = document.getElementById('nearbyStart');
	var msg = document.getElementById('nearbyMsg');
	var again = document.getElementById('nearbyAgain');
	var filterMsg = document.getElementById('nearbyFilterMsg');
	var steps = document.getElementById('nearbySteps');
	var fallback = document.getElementById('nearbyFallback');
	var jump = document.getElementById('nearbyJump');
	var nearSec = document.getElementById('nearby');
	var grid = document.getElementById('nearbyGrid');
	var genres = document.getElementById('nearbyGenres');
	var courseSec = document.getElementById('course');
	var quizEl = document.getElementById('epNearbyQuiz');
	if (!btn || !grid || !quizEl) return;

	// スポットを見て「戻る」で帰ってきたとき、もう一度ボタンを押させないために
	// 取れた座標をタブの中だけに残す（タブを閉じれば消える。サーバには保存しない）
	var ORIGIN_KEY = 'epNearbyOrigin';

	var say = function (text) { if (msg) msg.textContent = text || ''; };
	var sayFilter = function (text) { if (filterMsg) filterMsg.textContent = text || ''; };

	// 取得のたびに増やす。応答が返ったとき自分が最新でなければ捨てる。
	// 「取り直す」を続けて押すと、**古い座標の応答が後から届いて最新の結果を上書きする**
	var seq = 0;
	// 取得中はどちらのボタンも押せなくする（無効にしていたのは初回用のボタンだけだった）
	var busy = function (on) {
		btn.disabled = on;
		if (again) again.disabled = on;
	};

	// 位置情報は https（と localhost）でしか取れない。押しても必ず失敗するボタンは出さない
	if (!navigator.geolocation || window.isSecureContext === false) {
		say(t('geoUnsupported', 'この端末・ブラウザでは位置情報を使えません。'));
		return;
	}
	btn.hidden = false;

	function fail(text) {
		busy(false);
		say(text);
		// 「使わないときは」は最初から画面にある。失敗したときだけ、そこへ目を運ぶ
		if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	/**
	 * ジャンルの絞り込みチップを作る。結果に実際にあった親ジャンルだけを出す
	 * （空のチップを押させない）。絞り込みは読み込み済みの行に対して行うので通信しない。
	 */
	function buildGenres(list) {
		if (!genres) return;
		genres.innerHTML = '';
		// 1種類しか無いなら絞る意味が無い
		if (!list || list.length < 2) { genres.hidden = true; return; }

		var rows = grid.querySelectorAll('.nb-row');
		var all = [{ slug: '', name: t('genreAll', 'すべて'), count: rows.length }].concat(list);

		all.forEach(function (g, i) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'chip nb-chip' + (i === 0 ? ' on' : '');
			b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
			b.dataset.genre = g.slug;
			b.textContent = g.name + '（' + g.count + '）';
			b.addEventListener('click', function () {
				genres.querySelectorAll('.nb-chip').forEach(function (o) {
					var on = (o === b);
					o.classList.toggle('on', on);
					o.setAttribute('aria-pressed', on ? 'true' : 'false');
				});
				var shown = 0;
				rows.forEach(function (row) {
					var hit = (!g.slug || row.dataset.genre === g.slug);
					row.hidden = !hit;
					if (hit) shown++;
				});
				// 要約（どのあたり・何件・徒歩何分・範囲を広げたか）は消さない。別の枠で件数だけ伝える
				sayFilter(t('genreFiltered', '%d件を表示しています').replace('%d', shown));
			});
			genres.appendChild(b);
		});
		genres.hidden = false;
	}

	/** 「河原町・烏丸のあたり ・ 8件 徒歩2〜6分」。範囲を広げたときは、広げたことも書く。 */
	function whereText(r) {
		// 0件のときは件数を数えない。「0件」とだけ出ても、何が起きたのか分からない
		if (!r.count) return t('nearNone', '近くにご案内できる場所が見つかりませんでした。');
		var parts = [];
		if (r.area) parts.push(t('nearArea', '%s のあたり').replace('%s', r.area));
		parts.push(t('nearCount', '%d件').replace('%d', r.count));
		if (r.walk_min != null && r.walk_max != null) {
			parts.push(r.walk_min === r.walk_max
				? t('walkOne', '徒歩約%d分').replace('%d', r.walk_min)
				: t('walkRange', '徒歩%1$d〜%2$d分').replace('%1$d', r.walk_min).replace('%2$d', r.walk_max));
		}
		var line = parts.join(' ・ ');
		if (r.widened) line += '　' + t('nearWidened', '近くに少なかったため、範囲を広げています。');
		return line;
	}

	/**
	 * 座標が決まったあとの表示。近くの行き先と診断は並行して出す
	 * （行き先が0件でも、半径の広い交通手段ならコースは組めることがある）。
	 */
	function show(origin, fromHistory) {
		var mine = ++seq;
		try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin)); } catch (e) { /* 無視 */ }
		var url = grid.getAttribute('data-endpoint');
		url += (url.indexOf('?') === -1 ? '?' : '&') + 'lat=' + encodeURIComponent(origin.lat) + '&lng=' + encodeURIComponent(origin.lng);

		fetch(url)
			.then(function (res) { return res.json().then(function (json) { return { ok: res.ok, json: json }; }); })
			.then(function (r) {
				// もっと新しい取得が走っている。この応答は捨てる（座標も上書きしない）
				if (mine !== seq) { return; }
				if (!r.ok) {
					// エリア外は診断も組めない（サーバが同じ範囲で弾く）ので、ここで止めて次の一手を出す
					try { sessionStorage.removeItem(ORIGIN_KEY); } catch (e) { /* 無視 */ }
					fail((r.json && r.json.message) || t('loadFailed', '読み込みに失敗しました。'));
					return;
				}
				busy(false);
				sayFilter('');

				var found = !!r.json.count;
				if (found) {
					// HTMLはサーバが templates/row-spot.php で描いてエスケープ済み
					grid.innerHTML = r.json.html;
					buildGenres(r.json.genres);
				} else {
					grid.innerHTML = '';
				}

				// 見開きを畳み、空いた場所に「どこにいると受け取ったか」を出す。
				// 見出し（h1）は残す ―― 畳むのは写真と説明文だけ
				if (fv) fv.classList.add('nearby-fv--done');
				// 取得前の main は「位置情報を使わないときは」1枚だけで、その88pxの上余白は
				// 「上に欄がある」前提の値。欄が出てから戻す（→ style.css の #nearbyFallback）
				document.body.classList.add('nearby-located');
				if (again) again.hidden = false;
				if (steps) steps.hidden = true;

				// 0件なら「近くの行き先」の欄ごと出さない（見出しと罫線だけの空の欄を見せない）。
				// コースはバスや電車を使うので、歩ける場所が無くても組める
				nearSec.hidden = !found;
				courseSec.hidden = false;
				// 行き先が無いと飛び先が1つしかない。アンカーの列は出さない
				if (jump) jump.hidden = !found;

				// 結果が出たことを読み上げ、同じ文を画面にも残す。取得中だけ喋って成功を黙ると、
				// 画面を見ていない人には終わったのかどうか分からない
				say(whereText(r.json));

				// 診断は座標ごとに作り直す（「現在地を取り直す」で前の場所の設問・結果を残さない）
				quizEl.innerHTML = '';
				window.epQuizMount(quizEl, { origin: origin });

				if (!fromHistory) nearSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
			})
			.catch(function () {
				if (mine !== seq) { return; }
				fail(t('netFailed', '通信に失敗しました。時間をおいてお試しください。'));
			});
	}

	function locate() {
		if (btn.disabled) { return; }
		busy(true);
		say(t('geoLocating', '位置情報を取得しています…'));
		// 場所を取り直したら、前の場所で作ったコースは捨てる（別の起点の結果を出さない）
		try { sessionStorage.removeItem('epQuizResult_geo'); } catch (e) { /* 無視 */ }
		navigator.geolocation.getCurrentPosition(
			function (pos) {
				show({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
			},
			function () {
				// 拒否・タイムアウト・測位できない。どれでも次の一手は同じなので、分けて書かない
				++seq; // 走っている取得があれば、その応答も捨てる
				fail(t('geoNearbyDenied', '位置情報を使えませんでした。ブラウザの設定で位置情報を許可するか、下の探し方をお使いください。'));
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
		);
	}

	btn.addEventListener('click', locate);
	if (again) again.addEventListener('click', locate);

	// 「戻る」で来たときだけ、前の座標で開き直す（quiz.js も同じ条件で結果を復元する）
	var navType = '';
	try {
		var entries = performance.getEntriesByType('navigation');
		navType = (entries && entries[0]) ? entries[0].type : '';
	} catch (e) { /* 未対応ブラウザは通常扱い */ }
	var saved = null;
	try { saved = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) || 'null'); } catch (e) { /* 壊れた値は無視 */ }
	if (navType === 'back_forward' && saved && typeof saved.lat === 'number' && typeof saved.lng === 'number') {
		show(saved, true);
	} else {
		try { sessionStorage.removeItem(ORIGIN_KEY); } catch (e) { /* 無視 */ }
	}
})();
