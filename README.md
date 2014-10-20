Ingress Damage Reports Map
==========================

### 何ができるの？
Google から送られてくる Ingress Damage Report メールを解析して地図上に表示する Web アプリケーションです。

例えば、自分が過去にオーナーだったことのあるポータル(ほぼ UPC に相当)を地図上に表示できます。また、個別のポータルを誰がよく攻撃しているかや、何曜日・何時頃攻撃を受けやすいかもわかります。以下にデモサイトがあります。

http://ingress.xii.jp/

なお、こちらのサーバには認証情報やメールの内容は一切送らずに、ユーザの Web ブラウザと Google のサーバ間でのみ情報をやりとりしますので安心して使えます(そのかわり大量のデータは処理しずらいです)。

### 使い方
デモサイトを開くと、まず Gmail API を使って Gmail 内のメールの内容を読み取るための OAuth 2.0 認証を行います(初回の起動時のみ)。Ingress を利用している Google アカウントでログインをして、さらに Gmail API をこの Web アプリケーションで利用するために承認ボタンをおしてください。

認証に成功すると Gmail のデータを取得しはじめますのでしばらく待ってください。初回起動時は大量のメールを通信しますので結構時間がかかります。2回目以降はキャッシュを使うのでそこそこ速くなります。メールの取得が終わるとメールの内容を解析してその結果を地図上に丸印で表示します。青い丸(または緑の丸)はダメージを受けたポータル、赤い丸はダメージを受けたポータルのうち自分がオーナーだったことのあるポータル(ほぼ UPC に相当)です。


### 開発者向け情報
自分のサイトで Ingress Damage Reports Map を運用するには以下のようにします。

Google Developers Console から Gmail API と Google Maps JavaScript API v3 を有効にします。

https://console.developers.google.com/

Gmail API は Web Application として Client ID を発行し、Google Maps は Browser Applications として API Key を発行して、それぞれソース中の該当箇所を書き換えておきます。

HTML と JavaScript と CSS を自分のサイト上にコピーして HTML にアクセスすれば起動します。

### Ingress Damage Report Mail のフォーマット

2014年10月20日時点でのフォーマットです。
ingressmap.js の関数 parseBody(body) を見ながら読んでください。また、parserDebug = true にして実行するとパーサのログが表示されるのでそちらも参考にしてください。

まず、全体はヘッダ・ボディ・フッタの三部構成になっています。ヘッダとフッタは定形文でデータは二番目の tr に入っています。

ヘッダ(Ingress - Begin Transmissionの画像)
 div > table[width="750px"] > tbody > tr:eq(0)

ボディ
 div > table[width="750px"] > tbody > tr:eq(1)
 
フッタ(Ingress - End Transmissionの画像)
 div > table[width="750px"] > tbody > tr:eq(2)


ボディの中身はテーブルになっていて各 tr に色々なデータが入っています。
 div > table[width="750px"] > tbody > tr:eq(1) > td > table[width="700px"] > tbody > tr


tr の一行目は必ずエージェントの情報です。
 エージェント(agent)
 td > span:contains("Agent Name:") + span
 td > span:contains("Faction:") + span
 td > span:contains("Level:") + span


tr の二行目以降は以下のいずれかの情報が入っています。

 横棒(hr) 最初に出現するhrには DAMAGE REPORT の文字が入っています
 td[style*="border-bottom: 2px solid #403F41;"]

 ポータル名と住所とintel mapへのリンク(portal)
 td > div:eq(1) > a[href^="https://www.ingress.com/intel?ll="]

 ポータル画像(image) 大きめです(160px)
 td > div[style="width:1000px;"] > div[style*="height: 160px"] > img

 リンク先のポータル画像(linkedImage) メインのポータル画像よりちょっと小さめです(100px)
 td > div[style="width:1000px;"] > div[style*="height: 100px"] > img

 リンク破壊の文字列(linkDestroyed) 単数だと LINK DESTROYED, 複数だと LINKS DESTROYED です
 td > table[width="700px"] > tbody > tr > td[width="50px"] + td:contains(" DESTROYED")

 リンク先のポータル名と住所とintel mapへのリンク(linkedPortal)
 td > table[width="700px"] > tbody > tr > td[width="50px"] + td > a[href^="https://www.ingress.com/intel?ll="]

 ダメージ情報(damage)
 td > table[width="700px"] > tbody > tr > td[width="400px"] > div:contains("DAMAGE:")


最も典型的な、一通のメールで一つのポータルへ攻撃は以下のようなフォーマットです。
 agent
 hr
 portal
 image
 damage

リンク破壊が伴っていると以下のようになります。例は三本破壊の場合。
 agent
 hr
 portal
 image
 linkDestroyed
 linkedPortal
 linkedImage
 linkedPortal
 linkedImage
 linkedPortal
 linkedImage
 damage

一通のメール中に複数のポータルへの攻撃があると以下のようになります。
 agent
 hr
 portal
 image
 damage
 hr
 portal
 image
 damage
 hr
 portal
 image
 damage


正規表現っぽくまとめると以下の様になります。
 agent (hr portal image (linkDestroyed (linkedPortal linkedImage)+)* damage)+


もし間違いや新しいフォーマットをみつけたら教えて下さい :)



### 参考URL
Gmail API
https://developers.google.com/gmail/api/

Google Maps JavaScript API v3
https://developers.google.com/maps/documentation/javascript/



### 作者
Sabara
