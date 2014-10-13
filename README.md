Ingress Damage Reports Map
==========================

### 何ができるの？
Google から送られてくる Ingress Damage Report メールを解析して地図上に表示する Web アプリケーションです。

例えば、自分の訪問したポータル(ほぼ UPV に相当)や、自分が過去にオーナーだったことのあるポータル(ほぼ UPC に相当)を地図上に表示できます。また、個別のポータルを誰がよく攻撃しているかもわかります。以下にデモサイトがあります。

http://ingress.xii.jp/

なお、こちらのサーバには認証情報やメールの内容は一切送らずに、ユーザの Web ブラウザと Google のサーバ間でのみ情報をやりとりしますので安心して使えます(そのかわり大量のデータは処理しづらいです)。

### 使い方
デモサイトを開くと、まず Gmail API を使って Gmail 内のメールの内容を読み取るための OAuth 2.0 認証を行います(初回の起動時のみ)。Ingress を利用している Google アカウントでログインをして、さらに Gmail API をこの Web アプリケーションで利用するために承認ボタンをおしてください。

認証に成功すると Gmail のデータを取得しはじめますのでしばらく待ってください。初回起動時は大量のメールを通信しますので結構時間がかかります。2回目以降はキャッシュを使うのでそこそこ速くなります。メールの取得が終わるとメールの内容を解析してその結果を地図上に丸印で表示します。青い丸(または緑の丸)はダメージを受けたポータル(ほぼ UPV に相当)、赤い丸はダメージを受けたポータルのうち自分がオーナーだったことのあるポータル(ほぼ UPC に相当)です。


### 開発者向け情報
自分のサイトで Ingress Damage Reports Map を運用するには以下のようにします。

Google Developers Console から Gmail API と Google Maps JavaScript API v3 を有効にします。

https://console.developers.google.com/

Gmail API は Web Application として Client ID を発行し、Google Maps は Browser applications として API Key を発行して、それぞれソース中の該当箇所を書き換えておきます。

HTML と JavaScript と CSS を自分のサイト上にコピーして HTML にアクセスすれば起動します。

### 作者
Sabara
