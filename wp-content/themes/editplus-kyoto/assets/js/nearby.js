/**
 * 現在地から探す（/nearby/）
 * 「現在地を使う」→ 位置情報 → ① 近くの場所（REST editplus/v1/nearby がカードのHTMLを返す）
 *                              → ② 診断（quiz.js の epQuizMount に座標を渡す）
 *
 * 位置情報の許可は**ボタンを押したときに初めて**聞く。開いただけでダイアログを出すと、
 * 何に使うのか分からないまま断られ、ブラウザはその判断を覚えてしまう。
 */
(function () {
	'use strict';

	var T = window.epQuizI18n || {};
	var t = function (key, fallback) { return T[key] || fallback; };

	var btn = document.getElementById('nearbyStart');
	var fv = document.getElementById('nearbyFv');
	var msg = document.getElementById('nearbyMsg');
	var fallback = document.getElementById('nearbyFallback');
	var jump = document.getElementById('nearbyJump');
	var nearSec = document.getElementById('nearby');
	var grid = document.getElementById('nearbyGrid');
	var courseSec = document.getElementById('course');
	var quizEl = document.getElementById('epNearbyQuiz');
	if (!btn || !grid || !quizEl) return;

	// スポットを見て「戻る」で帰ってきたとき、もう一度ボタンを押させないために
	// 取れた座標をタブの中だけに残す（タブを閉じれば消える。サーバには保存しない）
	var ORIGIN_KEY = 'epNearbyOrigin';

	var say = function (text) { if (msg) msg.textContent = text || ''; };

	// 位置情報は https（と localhost）でしか取れない。押しても必ず失敗するボタンは出さない
	if (!navigator.geolocation || window.isSecureContext === false) {
		say(t('geoUnsupported', 'この端末・ブラウザでは位置情報を使えません。'));
		if (fallback) fallback.hidden = false;
		return;
	}
	btn.hidden = false;

	function fail(text) {
		btn.disabled = false;
		if (fv) fv.classList.remove('is-locating');
		say(text);
		if (fallback) fallback.hidden = false;
	}

	/**
	 * 座標が決まったあとの表示。近くの場所と診断は並行して出す
	 * （近くの場所が0件でも、半径の広い交通手段ならコースは組めることがある）。
	 */
	function show(origin, fromHistory) {
		try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin)); } catch (e) { /* 無視 */ }
		var url = grid.getAttribute('data-endpoint');
		url += (url.indexOf('?') === -1 ? '?' : '&') + 'lat=' + encodeURIComponent(origin.lat) + '&lng=' + encodeURIComponent(origin.lng);

		fetch(url)
			.then(function (res) { return res.json().then(function (json) { return { ok: res.ok, json: json }; }); })
			.then(function (r) {
				if (!r.ok) {
					// エリア外は診断も組めない（サーバが同じ範囲で弾く）ので、ここで止めて次の一手を出す
					try { sessionStorage.removeItem(ORIGIN_KEY); } catch (e) { /* 無視 */ }
					fail((r.json && r.json.message) || t('loadFailed', '読み込みに失敗しました。'));
					return;
				}
				btn.disabled = false;
				if (fv) { fv.classList.remove('is-locating'); fv.classList.add('is-done'); }
				say('');
				if (fallback) fallback.hidden = true;
				if (r.json.count) {
					// HTMLはサーバが templates/card-spot.php で描いてエスケープ済み
					grid.innerHTML = r.json.html;
				} else {
					var none = document.createElement('p');
					none.className = 'hotels-lead';
					none.textContent = t('nearNone', '近くにご案内できる場所が見つかりませんでした。');
					grid.innerHTML = '';
					grid.appendChild(none);
				}
				nearSec.hidden = false;
				courseSec.hidden = false;
				if (jump) jump.hidden = false;

				// 診断は座標ごとに作り直す（「現在地を取り直す」で前の場所の設問・結果を残さない）
				quizEl.innerHTML = '';
				window.epQuizMount(quizEl, { origin: origin });

				var label = btn.querySelector('.geo-label');
				if (label) label.textContent = t('relocate', '現在地を取り直す');
				if (!fromHistory) nearSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
			})
			.catch(function () {
				fail(t('netFailed', '通信に失敗しました。時間をおいてお試しください。'));
			});
	}

	btn.addEventListener('click', function () {
		btn.disabled = true;
		if (fv) fv.classList.add('is-locating'); // レーダーの回転を速める＝探している最中だと分かる
		say(t('geoLocating', '位置情報を取得しています…'));
		// 場所を取り直したら、前の場所で作ったコースは捨てる（別の起点の結果を出さない）
		try { sessionStorage.removeItem('epQuizResult_geo'); } catch (e) { /* 無視 */ }
		navigator.geolocation.getCurrentPosition(
			function (pos) {
				show({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
			},
			function () {
				// 拒否・タイムアウト・測位できない。どれでも次の一手は同じなので、分けて書かない
				fail(t('geoNearbyDenied', '位置情報を使えませんでした。ブラウザの設定で位置情報を許可するか、下の探し方をお使いください。'));
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
		);
	});

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
