const fs = require('fs');
const path = require('path');

const existingQuestions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'questions.json'), 'utf8'));

const newQuestions = [
  {
    "id": 51,
    "category": "Karakterler",
    "difficulty": "Orta",
    "question": "Wangshu Hanı'nda yaşayan 'Fatih İblis' lakaplı Xiao'nun gerçek Adeptus/Yaksha adı nedir?",
    "answers": ["Alatus", "Altın Kanatlı Kral"],
    "hint": "Göklerin Altın Kanatlı Kralı."
  },
  {
    "id": 52,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Beidou'nun gemisiyle seyahat eden şair ruhlu Anemo kılıç ustası Kaedehara Kazuha'nın anavatanı neresidir?",
    "answers": ["Inazuma", "İnazuma"],
    "hint": "Şimşek ve ebediyet ülkesi."
  },
  {
    "id": 53,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Raiden Ei'nin kendi kuklasını yapmadan önce yarattığı fakat merhamet edip serbest bıraktığı prototip kukla kimdir?",
    "answers": ["Scaramouche", "Wanderer", "Kunikuzushi", "Avare"],
    "hint": "Eski 6. Fatui Habercisi, şimdiki Sumerulu gezgin rüzgar çocuğu."
  },
  {
    "id": 54,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Sumeru'daki meşhur Alcazarzaray Sarayı'nı tasarlayan dahi mimar ve Alhaitham'ın ev arkadaşı kimdir?",
    "answers": ["Kaveh"],
    "hint": "Mehrak adında mekanik bir çantası olan sarışın beyefendi."
  },
  {
    "id": 55,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Kimsenin gülmediği soğuk kelime oyunları ve TCG kart oyununa tutkusuyla bilinen Sumeru Baş Yargıcı (General Mahamatra) kimdir?",
    "answers": ["Cyno"],
    "hint": "Anubis başlıklı çakal kaskı takan Electro mızrakçı."
  },
  {
    "id": 56,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Avidya Ormanı'nın baş korucusu olan büyük tilki kulaklı botanikçi Dendro okçusu kimdir?",
    "answers": ["Tighnari"],
    "hint": "Gezgin'e mantar zehirlenmesinde şifa veren korucu."
  },
  {
    "id": 57,
    "category": "Bölgeler & Sanat",
    "difficulty": "Orta",
    "question": "Nilou'nun büyüleyici Hydro danslarını sergilediği ve Büyük Çarşı'da bulunan Sumeru tiyatrosunun adı nedir?",
    "answers": ["Zubayr", "Zubayr Tiyatrosu", "Zubayr Theater"],
    "hint": "Tiyatronun yöneticisi olan beyefendinin soyadını taşır."
  },
  {
    "id": 58,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Fontaine'in yeraltı örgütü Spina di Rosula'nın neşeli sarışın başkanı kimdir?",
    "answers": ["Navia"],
    "hint": "Ateş eden şemsiyesi ve dev balyozuyla Geo hasarı verir."
  },
  {
    "id": 59,
    "category": "Karakterler",
    "difficulty": "Orta",
    "question": "Fontaine adalet sarayında hiç maç kaybetmemiş olan efsanevi 'Şampiyon Düellocu' kimdir?",
    "answers": ["Clorinde"],
    "hint": "Tabancası ve kılıcıyla Electro hasarı veren asil hanımefendi."
  },
  {
    "id": 60,
    "category": "Karakterler & Lore",
    "difficulty": "Kolay",
    "question": "Ganyu ve Shenhe'nin ustası olan vinç formundaki Adeptus Cloud Retainer, insan formuna girdiğinde hangi ismi kullanır?",
    "answers": ["Xianyun"],
    "hint": "Gözlüklü zarif bir hanımefendi olarak Liyue'ye yerleşmiştir."
  },
  {
    "id": 61,
    "category": "Bölgeler & Sanat",
    "difficulty": "Orta",
    "question": "Chenyu Vadisi'nden Liyue Limanı'na gelen Gaming'in sergilediği geleneksel dans sanatının adı nedir?",
    "answers": ["Wushou", "Wushou Dansı", "Wushou Dance"],
    "hint": "Renkli aslan başlığı takılarak yapılan akrobatik dans."
  },
  {
    "id": 62,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Fontaine'de Chioriya Butik'i işleten, çift kılıçlı aslen Inazumalı yetenekli terzi kimdir?",
    "answers": ["Chiori"],
    "hint": "Sode ve Kinu adında iki kumaş bebek kukla çağıran Geo kılıç ustası."
  },
  {
    "id": 63,
    "category": "Fatui Harbingers",
    "difficulty": "Kolay",
    "question": "House of the Hearth yetimhanesinin başındaki 4. Fatui Habercisi Arlecchino'ya çocukları hangi unvanla hitap eder?",
    "answers": ["Baba", "Father", "Pere"],
    "hint": "Anne değil, kendine Baba denmesini ister."
  },
  {
    "id": 64,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Meropide Kalesi revirinde başhemşirelik yapan ve insan formuna yakın sevimli Melusine kimdir?",
    "answers": ["Sigewinne"],
    "hint": "Kalp şeklinde köpük baloncukları sıkan Hydro tabancalı minik hemşire."
  },
  {
    "id": 65,
    "category": "Karakterler",
    "difficulty": "Orta",
    "question": "Fontaine'de ünlü bir parfüm uzmanı ve aynı zamanda adli olay yeri temizleyicisi olan Dendro mızrakçısı kimdir?",
    "answers": ["Emilie"],
    "hint": "Kokuların dilini çok iyi bilen zarif Fontaine hanımı."
  },
  {
    "id": 66,
    "category": "Karakterler & Natlan",
    "difficulty": "Kolay",
    "question": "Natlan'da Gezgin'i karşılayan, People of the Springs kabilesinden köpekbalığı sörfçüsü neşeli kız kimdir?",
    "answers": ["Mualani"],
    "hint": "Sörf tahtasıyla lavlarda ve sularda kayan Hydro karakteri."
  },
  {
    "id": 67,
    "category": "Karakterler & Natlan",
    "difficulty": "Orta",
    "question": "Natlan'da Scions of the Canopy kabilesinden Saurian avcısı olan ve yanında pikselli Ajaw ile dolaşan Dendro karakteri kimdir?",
    "answers": ["Kinich"],
    "hint": "Kanca ipiyle havada süzülen yeşil bandanalı genç."
  },
  {
    "id": 68,
    "category": "Karakterler & Natlan",
    "difficulty": "Kolay",
    "question": "Natlan'ın Children of Echoes kabilesinden olan ve 'Turbo Twirly' adlı kazıcı matkabına binen Geo savaşçısı minik kız kimdir?",
    "answers": ["Kachina"],
    "hint": "Tepotli Saurian dostuyla yeraltında maden arayan sevimli kız."
  },
  {
    "id": 69,
    "category": "Karakterler & Natlan",
    "difficulty": "Orta",
    "question": "Natlan'ın meşhur İsim Dokuyucusu (Name Weaver), antik demircisi ve tekerlekli patenleriyle gezen Geo savaşçısı kadın kimdir?",
    "answers": ["Xilonen"],
    "hint": "Leopar kulakları ve kuyruğu olan müzik ritimli zanaatkar."
  },
  {
    "id": 70,
    "category": "Fatui Harbingers",
    "difficulty": "Kolay",
    "question": "Fatui Habercileri'nin 1 numaralı en güçlü savaşçısı olan ve 'Kaptan' lakabıyla anılan maskeli dev kimdir?",
    "answers": ["Capitano", "Il Capitano", "Kaptan"],
    "hint": "Yüzü tamamen karanlık bir vizörle kaplı onurlu savaşçı."
  },
  {
    "id": 71,
    "category": "Fatui Harbingers",
    "difficulty": "Orta",
    "question": "Fatui'nin 2. Habercisi olan, insanların kopyalarını üreten ve Akademi'de geçmişte Zandik adıyla anılan 'Doktor' kimdir?",
    "answers": ["Dottore", "Il Dottore", "Doktor"],
    "hint": "Mavi maskeli acımasız dahi bilim insanı."
  },
  {
    "id": 72,
    "category": "Fatui Harbingers",
    "difficulty": "Zor",
    "question": "Fatui Habercileri'nin 3 numarası olan, melek kanatlı saç bandajı takan ve sürekli ninniler fısıldayan 'Damselette' kimdir?",
    "answers": ["Columbina", "Damselette"],
    "hint": "Son derece tatlı görünen ama Childe ve Wanderer'ın bile çekindiği tehlikeli kız."
  },
  {
    "id": 73,
    "category": "Fatui Harbingers",
    "difficulty": "Orta",
    "question": "Kuzey Krallığı Bankası'nı (Northland Bank) yöneten ve Fatui'nin ekonomik gücünü elinde tutan 9. Haberci kimdir?",
    "answers": ["Pantalone", "Regrator"],
    "hint": "Gözlüklü, zengin ve gülümseyen siyah saçlı banker."
  },
  {
    "id": 74,
    "category": "Fatui Harbingers",
    "difficulty": "Orta",
    "question": "Snezhnaya'nın belediye başkanı olan ve Tartaglia'yı Fatui'ye katan yaşlı 5. Haberci 'Horoz' kimdir?",
    "answers": ["Pulcinella", "The Rooster", "Horoz"],
    "hint": "Uzun sivri burunlu, kürk şapkalı minyon diplomat."
  },
  {
    "id": 75,
    "category": "Fatui Harbingers",
    "difficulty": "Zor",
    "question": "Raiden Shogun tarafından Inazuma'da idam edilen 8. Haberci La Signora'nın asıl Mondstadtlı adı nedir?",
    "answers": ["Rosalyne", "Rosalyne-Kruzchka Lohefalter", "Crimson Witch of Flames"],
    "hint": "Alevlerin Al Cadısı (Crimson Witch)."
  },
  {
    "id": 76,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Khaenri'ah'ın kraliyet muhafızı olan ve lanetlenerek ölümsüzleşen, 'Alacakaranlık Kılıcı' lakaplı gizemli gezgin kimdir?",
    "answers": ["Dainsleif", "Dain"],
    "hint": "Mavi ceketli, yarı maskeli ve Abis Tarikatı'nın amansız düşmanı."
  },
  {
    "id": 77,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Mondstadt Süvarileri Yüzbaşısı Kaeya'nın aslen Khaenri'ah kraliyet soyuna dayanan gerçek soyadı nedir?",
    "answers": ["Alberich"],
    "hint": "Klothar'ın kurduğu hanedanlığın son varisi."
  },
  {
    "id": 78,
    "category": "Hikaye & Lore",
    "difficulty": "Zor",
    "question": "Albedo'yu kretasöz simyasıyla tebeşirden yaratan ve 'Gold' lakaplı Khaenri'ahlı dahi kadın kimdir?",
    "answers": ["Rhinedottir", "Gold"],
    "hint": "Cadılar Meclisi (Hexenzirkel) üyesi ve Durin'in de yaratıcısı."
  },
  {
    "id": 79,
    "category": "Yaratıklar & Ejderhalar",
    "difficulty": "Orta",
    "question": "Dragonspine dağında devasa kaburgaları ve kalbi bulunan, Dvalin ile savaşırken ölen yozlaşmış ejderha kimdir?",
    "answers": ["Durin"],
    "hint": "Rhinedottir tarafından yaratılmış gölge ejderha."
  },
  {
    "id": 80,
    "category": "Yaratıklar & Ejderhalar",
    "difficulty": "Zor",
    "question": "Sumeru çölünün derinliklerinde yaşayan ve içinde bir ekosistem barındıran kadim yeşil Dendro Ejderhası kimdir?",
    "answers": ["Apep"],
    "hint": "Nahida'nın arındırmaya yardım ettiği devasa gövdeye sahip kadim ejderha."
  },
  {
    "id": 81,
    "category": "Yaratıklar & Ejderhalar",
    "difficulty": "Orta",
    "question": "Zhongli tarafından gözleri oyulup Liyue'deki Nantianmen ağacının altına hapsedilen kadim kör Geo Ejderhası kimdir?",
    "answers": ["Azhdaha"],
    "hint": "Toprağın öfkesiyle dört elementi değiştirebilen haftalık boss ejderha."
  },
  {
    "id": 82,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Fontaine Başyargıcı Neuvillette aslında kadim Yedi Hükümdar'dan (Sovereigns) hangisinin yeniden doğuşudur?",
    "answers": ["Su Ejderhası", "Hydro Sovereign", "Hydro Dragon"],
    "hint": "Fontaine'de ne zaman yağmur yağsa onun ağladığı söylenir."
  },
  {
    "id": 83,
    "category": "Hikaye & Lore",
    "difficulty": "Zor",
    "question": "Watatsumi halkını Enkanomiya'dan yüzeye çıkaran fakat Yashiori Adası'nda Raiden Ei tarafından Musou no Hitotachi ile kesilen dev yılan tanrı kimdir?",
    "answers": ["Orobashi", "Watatsumi Omikami", "Orobaxi"],
    "hint": "İskeleti Yashiori Adası boyunca uzanan devasa tanrı yılan."
  },
  {
    "id": 84,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Zhongli'nin kadim dostu olan, Guili Düzlükleri'ne onunla birlikte adını veren ve Archon Savaşı'nda vefat eden Toz Tanrısı kimdir?",
    "answers": ["Guizhong"],
    "hint": "Mekanik ve zeka ustası zarif tanrıça."
  },
  {
    "id": 85,
    "category": "Archonlar & Lore",
    "difficulty": "Orta",
    "question": "Raiden Ei'nin ikiz kız kardeşi olan ve 500 yıl önceki Khaenri'ah felaketinde hayatını kaybeden ilk Electro Archon kimdir?",
    "answers": ["Makoto", "Baal"],
    "hint": "Gerçek Baal odur, Ei ise Beelzebul'dur."
  },
  {
    "id": 86,
    "category": "Archonlar & Lore",
    "difficulty": "Orta",
    "question": "500 yıl önceki felakette Irminsul'u arındırıp kendini Nahida olarak yeniden doğuran önceki ulu Dendro Archon kimdir?",
    "answers": ["Rukkhadevata", "Büyük Lord Rukkhadevata"],
    "hint": "Kral Deshret ile birlikte Sumeru'yu koruyan ulu bilge."
  },
  {
    "id": 87,
    "category": "Archonlar & Lore",
    "difficulty": "Zor",
    "question": "Fontaine'in ilk Hydro Archon'u olan, okyanus perilerini insana dönüştürdüğü için lanetlenen ve Tunigi Boşluğu'nda gömülen tanrıça kimdir?",
    "answers": ["Egeria"],
    "hint": "Focalors'tan önceki su tanrıçası."
  },
  {
    "id": 88,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Sumeru çölündeki piramitleri inşa eden, Yasak Bilgi yüzünden deliren antik Kızıl Kral'ın diğer adı nedir?",
    "answers": ["King Deshret", "Deshret", "Al-Ahmar", "Kızıl Kral"],
    "hint": "Aaru ve Çöl medeniyetinin kurucusu hükümdar."
  },
  {
    "id": 89,
    "category": "Karakterler & Lore",
    "difficulty": "Kolay",
    "question": "Klee'nin annesi olan, Teyvat Gezi Rehberi'ni yazan ve neredeyse her şeye gücü yeten efsanevi cadı kimdir?",
    "answers": ["Alice"],
    "hint": "Altın Elma Takımadaları'nı Klee için bir tatil cennetine çeviren dahi cadı."
  },
  {
    "id": 90,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Alice, Rhinedottir ve Barbeloth gibi güçlü kadın büyücülerin bir araya geldiği gizemli meclisin adı nedir?",
    "answers": ["Hexenzirkel", "Cadılar Meclisi"],
    "hint": "Almanca 'Cadı Çemberi' anlamına gelen kadim kulüp."
  },
  {
    "id": 91,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Mondstadt'ta yaşayan, kirasını ödemekte zorlanan ama su aynasıyla geleceği gören dahi Hydro astrolog kimdir?",
    "answers": ["Mona", "Mona Megistus"],
    "hint": "Yıldızların kaderini okuyan şapkalı kız."
  },
  {
    "id": 92,
    "category": "Karakterler",
    "difficulty": "Orta",
    "question": "Kendine 'Kıyamet Prensesi' (Prinzessin der Verurteilung) diyen elektro okçu Fischl'ın gerçek adı nedir?",
    "answers": ["Amy"],
    "hint": "Babası ona küçükken bu isimle seslenirdi."
  },
  {
    "id": 93,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Fischl'ın yanında uçan, onun felsefi cümlelerini çeviren konuşan Electro gece kuzgununun adı nedir?",
    "answers": ["Oz", "Ozvaldo"],
    "hint": "Mein Fräulein diye hitap eden sadık kuş."
  },
  {
    "id": 94,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Wolvendom'da kurtlar tarafından büyütülen, Varka'dan kılıç kullanmayı öğrenen vahşi Electro çocuk kimdir?",
    "answers": ["Razor"],
    "hint": "Lupical benim ailem diyen kurt çocuk."
  },
  {
    "id": 95,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Favonius Şövalyesi olmak için aralıksız çalışan, dev kalkan ve zırhıyla hizmet eden Mondstadtlı Geo hizmetçi kız kimdir?",
    "answers": ["Noelle"],
    "hint": "Koca bir kılıcı tek eliyle savuran gül motifli hizmetçi."
  },
  {
    "id": 96,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Gündüzleri kilisede rahibe olan fakat geceleri Mondstadt'ın düşmanlarını gölgelerde avlayan Cryo mızrakçı kimdir?",
    "answers": ["Rosaria"],
    "hint": "Fazla mesai yapmaktan nefret eden kızıl saçlı rahibe."
  },
  {
    "id": 97,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Favonius Kilisesi'nin baş piyanisti ve 'Parıldayan İdol'ü olan, Jean'in öz kız kardeşi kimdir?",
    "answers": ["Barbara"],
    "hint": "Mondstadt halkına şarkılarıyla moral ve can veren Hydro şifacı."
  },
  {
    "id": 98,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Liyue'deki Alcor zırhlı gemisinin kaptanı olan ve Haishan adlı deniz canavarını Vision'ı olmadan yenen korsan kimdir?",
    "answers": ["Beidou"],
    "hint": "Electro karşı saldırısıyla dev hasarlar vuran gözü bantlı kaptan."
  },
  {
    "id": 99,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Liyue Qixing'in 'Tianquan'ı olan, Yeşim Saray'ın sahibi altın saçlı tüccar hanımefendi kimdir?",
    "answers": ["Ningguang"],
    "hint": "Geo taşlarını havada fırlatan Liyue'nin en zengin kadını."
  },
  {
    "id": 100,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Liyue Qixing'in 'Yuheng'i olan, tanrılara bel bağlamayıp insan iradesini savunan mor saçlı Electro kılıç ustası kimdir?",
    "answers": ["Keqing"],
    "hint": "Işınlanarak kılıç sallayan çevik genç kız."
  },
  {
    "id": 101,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Bubu Eczanesi'nin sahibi olan, boynundaki konuşan beyaz yılanla şifa dağıtan Dendro hekimi kimdir?",
    "answers": ["Baizhu"],
    "hint": "Ölümsüzlüğün sırrını araştıran yeşil saçlı gözlüklü doktor."
  },
  {
    "id": 102,
    "category": "Karakterler & Lore",
    "difficulty": "Orta",
    "question": "Doktor Baizhu'nun boynuna dolanmış olan bilge ve konuşan beyaz dişi yılanın adı nedir?",
    "answers": ["Changsheng"],
    "hint": "Kadim bir yılan ruhu olan şifa ustası."
  },
  {
    "id": 103,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Liyue Limanı'nın en ünlü hukuk danışmanı olan, Adeptus kanı taşıyan pembe saçlı Pyro katalizör kızı kimdir?",
    "answers": ["Yanfei"],
    "hint": "Kanun maddelerini ezbere bilen adalet aşığı kız."
  },
  {
    "id": 104,
    "category": "Karakterler & Sanat",
    "difficulty": "Kolay",
    "question": "Heyu Çay Evi'nde Liyue operalarını seslendiren ve Shenhe'nin hikayesini besteleyen ünlü Geo mızrak sanatçısı kimdir?",
    "answers": ["Yun Jin", "Yunjin"],
    "hint": "Opera başlığı ve geleneksel sahne kostümüyle bilinir."
  },
  {
    "id": 105,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Vücudundaki aşırı saf Yang enerjisini soğutmak için sürekli dondurma yiyen Liyueli genç şeytan kovucu kimdir?",
    "answers": ["Chongyun"],
    "hint": "Şeytanlar onun sıcaklığını hissedip kaçtığı için hiç iblis görememiştir."
  },
  {
    "id": 106,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Feiyun Tüccar Loncası'nın ikinci oğlu olan ve gizlice popüler dövüş sanatları romanları yazan Hydro kılıç ustası kimdir?",
    "answers": ["Xingqiu"],
    "hint": "Guhua kılıç sanatının ustası kitap kurdu delikanlı."
  },
  {
    "id": 107,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Kamisato Klanı'nın sadık kahyası olan ve aslen Mondstadt doğumlu olan Pyro mızrak kullanıcısı kimdir?",
    "answers": ["Thoma"],
    "hint": "Inazuma'da 'Ayak İşleri Uzmanı' olarak bilinir."
  },
  {
    "id": 108,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "'Beyaz Balıkçıl Prensesi' (Shirasagi Himegimi) unvanıyla tanınan Kamisato Klanı'nın zarif Cryo kızı kimdir?",
    "answers": ["Ayaka", "Kamisato Ayaka"],
    "hint": "Yelpazesiyle buz üzerinde dans eden asil kılıç ustası."
  },
  {
    "id": 109,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Naganohara Havai Fişekleri dükkanının neşeli işletmecisi olan altın kalpli Pyro okçu kimdir?",
    "answers": ["Yoimiya"],
    "hint": "Inazuma festivallerinin vazgeçilmez havai fişek kraliçesi."
  },
  {
    "id": 110,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Boyunun uzaması için fırsat buldukça uyuyan ve Mujina kostümü giyen Shuumatsuban ninjası kimdir?",
    "answers": ["Sayu"],
    "hint": "Rüzgar topu olup yuvarlanan küçük Anemo çift el kılıç kullanıcısı."
  },
  {
    "id": 111,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Arataki Çetesi'nin işlerini toparlayan, Liyue'de hukuk eğitimi almış maskeli Electro kız kimdir?",
    "answers": ["Kuki Shinobu", "Shinobu"],
    "hint": "Eski bir tapınak rahibesi olan yeşil saçlı şifacı."
  },
  {
    "id": 112,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Tenryou Komisyonu'nda çalışan, suçluları yumruklarıyla alt eden dahi dedektif kimdir?",
    "answers": ["Heizou", "Shikanoin Heizou"],
    "hint": "Anemo elementiyle yakın dövüş (katalizör yumruk) yapan genç dedektif."
  },
  {
    "id": 113,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Watatsumi Direniş Ordusu'nun köpek kulaklı ve kuyruklu sadık Geo generali kimdir?",
    "answers": ["Gorou"],
    "hint": "Yae Miko'nun dergisinde gizlice 'Bayan Hina' köşesini yazan general."
  },
  {
    "id": 114,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Watatsumi Adası'nın İlahi Rahibesi, usta askeri stratejisti ve denizanası çağıran Hydro şifacısı kimdir?",
    "answers": ["Kokomi", "Sangonomiya Kokomi"],
    "hint": "Enerjisi bitince mağarasına çekilip kitap okuyan balık temalı lider."
  },
  {
    "id": 115,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Komaniya Ekspresi'nde kargo kuryeliği yapan, koliye dönüşebilen iki kuyruklu kedi Youkai (Nekomata) kimdir?",
    "answers": ["Kirara"],
    "hint": "Kutuların içine girip tırmanan sevimli Dendro kılıç ustası."
  },
  {
    "id": 116,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Sumeru Akademisi'nde tez yetiştirme stresi yaşayan ve uyurgezerken dahi bir büyücüye dönüşen öğrenci kimdir?",
    "answers": ["Layla"],
    "hint": "Yıldız haritaları çizen uykusuz Cryo kalkan ustası."
  },
  {
    "id": 117,
    "category": "Karakterler",
    "difficulty": "Orta",
    "question": "100 yıl boyunca antik kalıntılarda kapalı kalan ve herkese kendisine 'Kıdemli/Bayan' denmesini şart koşan dahi dilbilimci kimdir?",
    "answers": ["Faruzan", "Madam Faruzan", "Bayan Faruzan"],
    "hint": "Anemo destekçisi üçgen mekanik fırlatan minyon profesör."
  },
  {
    "id": 118,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Sumeru'da cin lambasıyla gezen ve 'Mora, Mora, güzel Mora' şarkısını söyleyen kurnaz tüccar kimdir?",
    "answers": ["Dori"],
    "hint": "Mor ciniyle elektro tırmığı atan pembe saçlı tüccar."
  },
  {
    "id": 119,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "'Alev Yelesi' (Flame-Mane) lakaplı, Dunyarzad'ın sadık koruması olan çöl paralı askeri kimdir?",
    "answers": ["Dehya"],
    "hint": "Pyro yumruklarıyla düşmanları ezen cesur çöl kadını."
  },
  {
    "id": 120,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Aaru Köyü'nün kalkanlı ve mızraklı koruyucusu olan, Kızıl Kral Deshret soyundan gelen heterokromi gözlü kadın kimdir?",
    "answers": ["Candace"],
    "hint": "Köyüne saldıranları kalkan darbesiyle püskürten Hydro savaşçı."
  },
  {
    "id": 121,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Mondstadt'ta Amber'ın yardımıyla yaşama tutunan ve Sumeru'da Tighnari'nin öğrencisi olan Dendro korucu kız kimdir?",
    "answers": ["Collei"],
    "hint": "Cuilein-Anbar adında mekanik bir oyuncak atan sevimli okçu."
  },
  {
    "id": 122,
    "category": "Karakterler",
    "difficulty": "Orta",
    "question": "Sessizliğin Tapınağı'nın (Temple of Silence) genç lideri olan ve Hermanubis'in gücünü taşıyan Natlan öncesi gelen Electro okçu kimdir?",
    "answers": ["Sethos"],
    "hint": "Cyno ile düello yapan çölün bilge çocuğu."
  },
  {
    "id": 123,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Fontaine'in The Steambird gazetesinde muhabirlik yapan ve 'Monsieur Verite' adlı kamerasıyla gezen kız kimdir?",
    "answers": ["Charlotte"],
    "hint": "Haber peşinde fotoğraf çekerek Cryo hasarı veren gazeteci."
  },
  {
    "id": 124,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Lyney'in sihirbaz asistanı olan, duygusuz görünüşlü kedi kulaklı Anemo kılıç ustası kız kardeşi kimdir?",
    "answers": ["Lynette"],
    "hint": "Babbage kutusuna girip koşan sihirbaz yardımcısı."
  },
  {
    "id": 125,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "House of the Hearth kardeşlerinden olan, 'Pers' adında kurmalı pengueniyle gezen yalnız Fontaine dalgıcı kimdir?",
    "answers": ["Freminet"],
    "hint": "Dalgıç kaskıyla suyun altında huzur bulan Cryo çift el kılıç kullanıcısı."
  },
  {
    "id": 126,
    "category": "Karakterler",
    "difficulty": "Kolay",
    "question": "Fontaine Özel Güvenlik ve Gözetim Devriyesi kaptanı olan, tüfek kullanan ve kızarmış patatesi çok seven kadın kimdir?",
    "answers": ["Chevreuse"],
    "hint": "Overload reaksiyonunu aşırı güçlendiren şapkalı Pyro yüzbaşı."
  },
  {
    "id": 127,
    "category": "Karakterler & Natlan",
    "difficulty": "Orta",
    "question": "Natlan'da Flower-Feather Clan kabilesinden olan ve havada uçan devasa silahıyla düşmanları avlayan Anemo kadın kimdir?",
    "answers": ["Chasca"],
    "hint": "Qucusaur dostuyla göklerde süzülen kovboy şapkalı nişancı."
  },
  {
    "id": 128,
    "category": "Karakterler & Natlan",
    "difficulty": "Orta",
    "question": "Natlan'da Masters of the Night-Wind kabilesinden olan ve Capitano ile gizli planlar yapan Electro okçu kimdir?",
    "answers": ["Ororon"],
    "hint": "Yarasa benzeri gece ruhlarıyla çalışan gizemli genç adam."
  },
  {
    "id": 129,
    "category": "Archonlar & Natlan",
    "difficulty": "Kolay",
    "question": "Natlan'ın mevcut Pyro Archon'u olan, 'Habis Alev' unvanlı ve motorsikletiyle gezen efsanevi kadın kimdir?",
    "answers": ["Mavuika"],
    "hint": "Gözlükleri ve kızıl alevli saçlarıyla bilinen savaş tanrıçası."
  },
  {
    "id": 130,
    "category": "Hikaye & Lore",
    "difficulty": "Kolay",
    "question": "Gezgin'in kayıp ikizinin (Aether/Lumine) Teyvat'ta şu anda liderliğini yürüttüğü karanlık örgütün adı nedir?",
    "answers": ["Abyss Order", "Abis Tarikatı", "Abyss"],
    "hint": "Celestia'yı devirmek isteyen canavarlar ve büyücüler ordusu."
  },
  {
    "id": 131,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Teyvat'ın her yerinde bulunan maskeli Hilichurl yaratıkları aslında 500 yıl önce kimlerdi?",
    "answers": ["Khaenri'ah halkı", "Khaenriahlılar", "Lanetlenmiş insanlar", "Khaenriah"],
    "hint": "Tanrısız yeraltı krallığının lanetlenerek canavara dönüşen masum sakinleri."
  },
  {
    "id": 132,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Macera Loncası'nın her şehirdeki danışma görevlisi olan ve bazen 'Error, rebooting' diyen Katheryne aslında nedir?",
    "answers": ["Biyonik kukla", "Robot", "Android", "Kukla", "Snezhnaya kuklası"],
    "hint": "Snezhnaya teknolojisiyle üretilmiş yapay mekanik bir varlık."
  },
  {
    "id": 133,
    "category": "Hikaye & Lore",
    "difficulty": "Kolay",
    "question": "Teyvat kıtasındaki bütün hatıraların, tarihin ve elemental akışın kayıtlı olduğu devasa beyaz kök ağına sahip ağaç nedir?",
    "answers": ["Irminsul"],
    "hint": "Nahida ve Gezgin'in hafızasını değiştirebildiği kadim dünya ağacı."
  },
  {
    "id": 134,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Teyvat'ın kader kanunlarına tabi olmayan, dış dünyadan gelen ve dünyayı değiştirebilen varlıklara ne ad verilir?",
    "answers": ["Descender", "İnenler", "İnen"],
    "hint": "Göklerden bu dünyaya 'inen' kudretli yolcular."
  },
  {
    "id": 135,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "Gezgin (Aether / Lumine), Fatui kayıtlarına göre Teyvat'a dışarıdan gelen kaçıncı 'İnen'dir (Descender)?",
    "answers": ["Dördüncü", "4", "4."],
    "hint": "Üçüncü İnen'in kalıntıları Gnosis'leri oluşturmuştur; biz ise ondan sonrayız."
  },
  {
    "id": 136,
    "category": "Oyun Mekanikleri & Lore",
    "difficulty": "Kolay",
    "question": "Teyvat'ta tanrıların insanların arzularını onaylayarak onlara element gücü bahşettiği cam küreye ne ad verilir?",
    "answers": ["Vision", "Göz", "Tanrı Gözü", "Element Gözü"],
    "hint": "Karakterlerin kıyafetlerinde asılı duran parlayan küre."
  },
  {
    "id": 137,
    "category": "Oyun Mekanikleri & Lore",
    "difficulty": "Kolay",
    "question": "Fatui tarafından üretilen, kullanıcısına sahte element gücü veren fakat ömrünü tüketen karanlık araca ne denir?",
    "answers": ["Delusion", "Kandırış", "Sanrı"],
    "hint": "Diluc'un babasının da ölümüne sebep olan tehlikeli güç odağı."
  },
  {
    "id": 138,
    "category": "Oyun Mekanikleri & Lore",
    "difficulty": "Kolay",
    "question": "Yedi Archon'un Celestia ile bağlantısını kuran ve satranç taşına benzeyen ilahi iç organ/güç odağının adı nedir?",
    "answers": ["Gnosis", "Tanrı Yüreği"],
    "hint": "Tsaritsa'nın tüm Teyvat'tan toplamaya çalıştığı nesneler."
  },
  {
    "id": 139,
    "category": "Hikaye & Lore",
    "difficulty": "Orta",
    "question": "'Teyvat'ın gökyüzü sahte, yıldızlar koca bir yalandan ibaret' sözünü ilk meteor etkinliğinde söyleyen karakter kimdir?",
    "answers": ["Scaramouche", "Wanderer", "Kunikuzushi"],
    "hint": "Mona ve Gezgin'in ilk karşılaştığı 6. Fatui Habercisi."
  },
  {
    "id": 140,
    "category": "Hikaye & Lore",
    "difficulty": "Kolay",
    "question": "Oyunun başında Paimon'u bir 'Acil Durum Yemeği' olarak tanıttığımız ilk Mondstadtlı karakter kimdir?",
    "answers": ["Amber"],
    "hint": "Bizi Mondstadt girişinde karşılayan kırmızı kurdeleli okçu."
  },
  {
    "id": 141,
    "category": "Bölgeler & Lore",
    "difficulty": "Kolay",
    "question": "Liyue'de her yıl Morax'ın bizzat gökten inip şehre bir yıllık ekonomik rehberlik verdiği kutsal törene ne denir?",
    "answers": ["İniş Ayini", "Rite of Descension"],
    "hint": "Gezgin'in Zhongli'nin sahte cesedinin düştüğüne şahit olduğu tören."
  },
  {
    "id": 142,
    "category": "Bölgeler & Lore",
    "difficulty": "Kolay",
    "question": "Inazuma'da Raiden Shogun'un tüm halkın Vision'larını toplatıp heykele diktirdiği fermanın adı nedir?",
    "answers": ["Göz Avı Kararnamesi", "Vision Hunt Decree", "Göz Avı"],
    "hint": "Sonsuzluğa ulaşmak için insanların hayallerini elinden alan ferman."
  },
  {
    "id": 143,
    "category": "Bölgeler & Lore",
    "difficulty": "Kolay",
    "question": "Sumeru halkının kulaklarına taktığı yeşil yaprak cihazıyla bilgiye anında eriştiği antik veri tabanının adı nedir?",
    "answers": ["Akasha", "Akasha Sistemi", "Akasha Terminali"],
    "hint": "Halkın rüyalarını çalarak çalışan yapay zeka bilgi ağı."
  },
  {
    "id": 144,
    "category": "Bölgeler & Lore",
    "difficulty": "Orta",
    "question": "Fontaine Adalet Sarayı'nda kararları veren ve arkasında Focalors'un gizlendiği dev mekanik terazi makinesinin adı nedir?",
    "answers": ["Oratrice", "Oratrice Mecanique d'Analyse Cardinale"],
    "hint": "Halkın adalet inancından Indemnitium enerjisi üreten dev cihaz."
  },
  {
    "id": 145,
    "category": "Oyun Mekanikleri",
    "difficulty": "Kolay",
    "question": "Mondstadt açıklarındaki Musk Reef adasında bulunan Spiral Abyss (Hiçlik Sarmalı) toplam kaç kattan oluşur?",
    "answers": ["12", "On iki", "12 kat"],
    "hint": "9, 10, 11 ve 12. katlar ayda iki kez sıfırlanır."
  },
  {
    "id": 146,
    "category": "Oyun Mekanikleri",
    "difficulty": "Kolay",
    "question": "Anemo elementi ile Pyro, Hydro, Electro veya Cryo elementlerinden biri temas ettiğinde oluşan reaksiyon nedir?",
    "answers": ["Swirl", "Girdap"],
    "hint": "Rüzgarın elementi etrafa yayarak alan hasarı vermesi."
  },
  {
    "id": 147,
    "category": "Oyun Mekanikleri",
    "difficulty": "Kolay",
    "question": "Geo elementi diğer elementlerle temas ettiğinde yere koruyucu elemental kalkan kristalleri düşüren reaksiyon nedir?",
    "answers": ["Crystallize", "Kristalleşme", "Kristal"],
    "hint": "Yerden aldığınızda size kalkan sağlar."
  },
  {
    "id": 148,
    "category": "Oyun Mekanikleri",
    "difficulty": "Orta",
    "question": "Electro ve Cryo elementleri birleştiğinde düşmanların Fiziksel Direncini (Physical RES) %40 düşüren reaksiyon nedir?",
    "answers": ["Superconduct", "Aşırı İletkenlik", "Süper İletkenlik"],
    "hint": "Eula ve Razor gibi fiziksel hasar verenlerin en sevdiği reaksiyon."
  },
  {
    "id": 149,
    "category": "Oyun Mekanikleri",
    "difficulty": "Kolay",
    "question": "Hydro ve Cryo elementleri bir düşmanda bir araya geldiğinde düşmanı tamamen hareketsiz kılan reaksiyon nedir?",
    "answers": ["Frozen", "Donma", "Dondurma"],
    "hint": "Ayaka ve Ganyu ile düşmanları buz heykeline çeviren reaksiyon."
  },
  {
    "id": 150,
    "category": "Genel Kültür",
    "difficulty": "Kolay",
    "question": "Genshin Impact oyunu PC, PlayStation ve mobil platformlarda dünya çapında ilk olarak hangi yılda çıkış yapmıştır?",
    "answers": ["2020", "28 Eylül 2020"],
    "hint": "Pandemi döneminde sonbaharda yayınlanan devasa açık dünya oyunu."
  }
];

// Combine 1-50 and 51-150
const combined = [...existingQuestions, ...newQuestions];

// Validate ids are sequential 1 to 150
for (let i = 0; i < combined.length; i++) {
  combined[i].id = i + 1;
}

console.log('Total questions combined:', combined.length);
fs.writeFileSync(path.join(__dirname, '..', 'src', 'questions.json'), JSON.stringify(combined, null, 2), 'utf8');
console.log('Successfully written to src/questions.json!');
