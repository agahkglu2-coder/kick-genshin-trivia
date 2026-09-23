const fs = require('fs');
const path = require('path');

const QUESTIONS_PATH = path.join(__dirname, '..', 'src', 'questions.json');
const existingQuestions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));

console.log(`Mevcut soru sayısı: ${existingQuestions.length}`);

const newQuestions = [
  {
    id: 151,
    category: "Natlan & Ejderhalar",
    difficulty: "Orta",
    question: "Natlan'da Kinich'in yanında dolaşan, pikselli ejderha formundaki kibirli varlığın tam adı nedir?",
    answers: ["K'uhul Ajaw", "Ajaw", "Kuhul Ajaw"],
    hint: "Kendisine 'Yüce Ateş Ejderhası Lordu' diyen pikselli minik dost."
  },
  {
    id: 152,
    category: "Natlan & Ejderhalar",
    difficulty: "Kolay",
    question: "Natlan kabilelerinde yaşayan, binek olarak evcilleştirilebilen sürüngen/ejderha türlerine genel olarak ne ad verilir?",
    answers: ["Saurian", "Saurianlar", "Soriyan"],
    hint: "Kabilelerin en sadık yol arkadaşları olan antik yaratıklar."
  },
  {
    id: 153,
    category: "Natlan & Ejderhalar",
    difficulty: "Orta",
    question: "People of the Springs kabilesinin suda sörf yapabilen ve lav üzerinde kayabilen mavi Saurian türü nedir?",
    answers: ["Koholasaur", "Koholasaurus", "Koholasor"],
    hint: "Mualani'nin köpekbalığı sörf tahtasına ilham veren deniz canlısı."
  },
  {
    id: 154,
    category: "Natlan & Ejderhalar",
    difficulty: "Orta",
    question: "Scions of the Canopy kabilesinin kancasıyla ağaçlar ve uçurumlar arasında sallanabilen yeşil Saurian türü nedir?",
    answers: ["Yumkasaur", "Yumkasaurus", "Yumkasor"],
    hint: "Kinich gibi havada süzülüp kanca atabilen orman Saurian'ı."
  },
  {
    id: 155,
    category: "Natlan & Ejderhalar",
    difficulty: "Orta",
    question: "Children of Echoes kabilesinin yeraltında tünel kazabilen ve katı kayaları parçalayabilen turuncu Saurian türü nedir?",
    answers: ["Tepetlisaur", "Tepetlisaurus", "Tepetlisor"],
    hint: "Kachina'nın matkabına eşlik eden dayanıklı toprak kazıcısı."
  },
  {
    id: 156,
    category: "Natlan & Ejderhalar",
    difficulty: "Zor",
    question: "Chasca'yı bebekken bulan ve onu kendi yavruları gibi yetiştiren uçan Saurian türü nedir?",
    answers: ["Qucusaur", "Qucusaurs", "Kukuzor", "Qukusaur"],
    hint: "Flower-Feather Clan'ın göklerde süzülen dev kanatlı Saurian'ı."
  },
  {
    id: 157,
    category: "Natlan & Ejderhalar",
    difficulty: "Orta",
    question: "Masters of the Night-Wind kabilesinden olan, yarasalarla iletişim kurabilen ve Capitano ile gizli planlar yapan genç kimdir?",
    answers: ["Olorun", "Oloron"],
    hint: "Gece Rüzgarlarının gizemli ve içine kapanık Electro çocuğu."
  },
  {
    id: 158,
    category: "Natlan & Ejderhalar",
    difficulty: "Zor",
    question: "Natlan'da düşen kahramanların isimlerinin Wayob ve Kutsal Alev tarafından geri getirilmesini sağlayan ilahi ritüele ne denir?",
    answers: ["Ode to Resurrection", "Diriliş Şarkısı", "Diriliş Türküsü", "Resurrection"],
    hint: "Ode to ... şeklinde bilinen Natlan'ın ölümden dönüş marşı."
  },
  {
    id: 159,
    category: "Natlan & Ejderhalar",
    difficulty: "Zor",
    question: "Natlan'da yaşayan her savaşçının atalarından devraldığı, kahramanlıklarını mühürleyen kutsal ünvana ne ad verilir?",
    answers: ["Ancient Name", "Antik İsim", "Kadim İsim"],
    hint: "Gezgin'e de Mavuika ve Xilonen tarafından dokunan kutsal miras."
  },
  {
    id: 160,
    category: "Natlan & Ejderhalar",
    difficulty: "Zor",
    question: "Natlan'ın derinliklerinde yer alan, ruhların ve Wayob'un ikamet ettiği gölgeli antik boyutun adı nedir?",
    answers: ["Night Kingdom", "Gece Krallığı"],
    hint: "Abyss istilasına karşı savaşçıların ruhlarıyla koruduğu karanlık alem."
  },
  {
    id: 161,
    category: "Fontaine & Adalet",
    difficulty: "Zor",
    question: "Eski Hydro Archon Egeria'nın günahı sayılan ve Fontaine halkının aslen hangi varlıklardan dönüştürüldüğü ortaya çıkmıştır?",
    answers: ["Oceanid", "Oceanidler", "Okyanus Perisi", "Lochfolk"],
    hint: "Rhodeia gibi su formundaki sadık canlılar."
  },
  {
    id: 162,
    category: "Fontaine & Adalet",
    difficulty: "Zor",
    question: "Focalors'un 500 yıl boyunca biriktirdiği adalet enerjisiyle Hydro Archon tahtını yok etmek için kullandığı dev kılıç düzeneği nedir?",
    answers: ["Damocles", "Kıyamet Kılıcı", "İnfaz Kılıcı", "Execution"],
    hint: "Tavandan inip Archon'un üzerine düşen adalet kılıcı."
  },
  {
    id: 163,
    category: "Fontaine & Adalet",
    difficulty: "Orta",
    question: "Wriothesley'in Meropide Kalesi'nin gizli hangarında kehanet sularından kaçış için inşa ettiği dev mekanik geminin adı nedir?",
    answers: ["Wingalet", "The Wingalet"],
    hint: "Pankreas gibi sualtından fırlayan dev uçan gemi."
  },
  {
    id: 164,
    category: "Fontaine & Adalet",
    difficulty: "Orta",
    question: "Fontaine'de Navia'nın en sadık iki koruması olan ve Poisson felaketinde eriyerek can veren kahraman ikili kimdir?",
    answers: ["Silver ve Melus", "Melus ve Silver", "Melus", "Silver"],
    hint: "Spina di Rosula'nın şemsiye tutan centilmen korumaları."
  },
  {
    id: 165,
    category: "Fontaine & Adalet",
    difficulty: "Kolay",
    question: "Fontaine sualtında yaşayan, tembelce dinlenen ve deniz samuruna benzeyen sevimli maskot yaratıklara ne denir?",
    answers: ["Blubberbeast", "Blubberbeastler"],
    hint: "Sonik dalgalar yayarak sonar kullanan pofuduk su canlısı."
  },
  {
    id: 166,
    category: "Fontaine & Adalet",
    difficulty: "Zor",
    question: "Fontaine'in altındaki İlkel Deniz'den çıkan devasa haftalık boss All-Devouring Narwhal (Denizgergedanı) kimin evcil hayvanıdır?",
    answers: ["Skirk", "Surtalogi"],
    hint: "Tartaglia'nın Abyss'teki ustası veya onun hocası."
  },
  {
    id: 167,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Tartaglia'ya (Childe) Abyss'e düştüğünde kılıç kullanmayı ve Foul Legacy tekniğini öğreten gizemli kadın usta kimdir?",
    answers: ["Skirk"],
    hint: "Abyss'in derinliklerinde yaşayan kılıç ustası kadın."
  },
  {
    id: 168,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Skirk'in hocası olan ve Khaenri'ah'ın Beş Günahkarı'ndan biri sayılan 'Kusursuz' (The Foul) kimdir?",
    answers: ["Surtalogi", "The Foul"],
    hint: "Dev denizgergedanını besleyen kadim uzay savaşçısı."
  },
  {
    id: 169,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Kaeya'nın da soyundan geldiği, Khaenri'ah felaketinden sonra Abyss Tarikatı'nı (Abyss Order) ilk kuran adam kimdir?",
    answers: ["Chlothar Alberich", "Chlothar", "Klothar"],
    hint: "Gezgin'in Caribert anılarında karşılaştığı çaresiz baba."
  },
  {
    id: 170,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Chlothar Alberich'in Hilichurl'a dönüşen ve Loom of Fate (Kader Tezgahı) projesinin çekirdeği haline gelen talihsiz oğlunun adı nedir?",
    answers: ["Caribert", "Caribert Alberich"],
    hint: "Gezgin ile ormanda sohbet eden ve bilinci korunan çocuk."
  },
  {
    id: 171,
    category: "Lore & Gizemler",
    difficulty: "Orta",
    question: "Khaenri'ah'ın kraliyet hanedanı ve 500 yıl önceki felakette tahtta olan krallık hanedanının adı nedir?",
    answers: ["Eclipse Hanedanı", "Eclipse", "Güneş Tutulması Hanedanı", "Eclipse Dynasty"],
    hint: "Tutulma anlamına gelen göksel isim."
  },
  {
    id: 172,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Oyunun açılış sinematiğinde Gezgin ve ikizini Teyvat'ta engelleyip ayıran kırmızı kübik güçlere sahip tanrıçanın adı nedir?",
    answers: ["Unknown God", "Bilinmeyen Tanrı", "Asmoday"],
    hint: "Cennetsel ilkeleri (Heavenly Principles) uygulayan gizemli varlık."
  },
  {
    id: 173,
    category: "Lore & Gizemler",
    difficulty: "Orta",
    question: "Dainsleif, Gezgin ile yolculuk yapabilmesi ve sorularına cevap vermesi karşılığında simgesel olarak kaç Mora istemiştir?",
    answers: ["500", "500 Mora"],
    hint: "500 yıl önceki felaketi simgeleyen ufak bir bozuk para miktarı."
  },
  {
    id: 174,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Celestia'nın antik çağlarda Dragonspine ve Chasm gibi yerlere gökten fırlatarak felaket getirdiği dev sütunlara ne denir?",
    answers: ["Skyfrost Nail", "Celestial Nail", "Gök Çivisi", "Cennet Çivisi"],
    hint: "Dağların tepesinde asılı duran devasa kristal kazıklar."
  },
  {
    id: 175,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Teyvat kıtasının dış sınırlarında yer alan, Yedi Archon'un hakimiyeti dışındaki karanlık sulara ne ad verilir?",
    answers: ["Dark Sea", "Karanlık Deniz"],
    hint: "Archon Savaşı'nı kaybeden canavarların kaçtığı sınır ötesi alem."
  },
  {
    id: 176,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Cadılar Meclisi (Hexenzirkel) üyesi olan ve Teyvat'taki kader değişimlerinde göklerden Gezgin ile telepatik konuşan cadı kimdir?",
    answers: ["Nicole", "N"],
    hint: "Sesi bir çay fincanından veya zihinden yankılanan rehber kadın."
  },
  {
    id: 177,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Mona'nın ustası olan ve Alice ile ezeli bir rekabet içinde bulunan yaşlı kehanet cadısının adı nedir?",
    answers: ["Barbeloth", "Bayan B"],
    hint: "Mona'ya eski günlüğü bulması için görev veren yaşlı astrolog."
  },
  {
    id: 178,
    category: "Lore & Gizemler",
    difficulty: "Zor",
    question: "Teyvat masalları yazarı olan ve Cadılar Meclisi'nde 'M' harfiyle anılan ölümlü yazar kadın kimdir?",
    answers: ["Andersdotter", "M"],
    hint: "The Boar Princess masalının yazarı."
  },
  {
    id: 179,
    category: "Sumeru & Orman",
    difficulty: "Kolay",
    question: "Sumeru ormanlarında yaşayan, mantar ve bitki formundaki sadece çocukların görebildiği sevimli orman perilerine ne denir?",
    answers: ["Aranara", "Aranaralar"],
    hint: "Şarkı söylemeyi ve Nara'lara yardım etmeyi seven minik dostlar."
  },
  {
    id: 180,
    category: "Sumeru & Orman",
    difficulty: "Orta",
    question: "Aranara kabilesinin Gezgin'e taktığı ve 'Altın Saçlı İnsan' anlamına gelen özel lakap nedir?",
    answers: ["Nara Varuna", "Nara"],
    hint: "Nara ... şeklinde söylenen hitap."
  },
  {
    id: 181,
    category: "Sumeru & Orman",
    difficulty: "Zor",
    question: "Marana (Withering) felaketine karşı Gezgin'le savaşıp kendisini yeni bir Ashvattha Ağacı'na dönüştüren cesur Aranara kimdir?",
    answers: ["Arama"],
    hint: "Aranara görev serisinin sonunda ağaca dönüşen kahraman."
  },
  {
    id: 182,
    category: "Sumeru & Orman",
    difficulty: "Orta",
    question: "Collei'nin çocukken muzdarip olduğu ve Sumeru'da Irminsul arındırılana kadar insanları taşa çeviren ölümcül hastalığın adı nedir?",
    answers: ["Eleazar", "Eleazar Hastalığı"],
    hint: "Dunyarzad'ın da hayatını tehdit eden gri pullu hastalık."
  },
  {
    id: 183,
    category: "Sumeru & Orman",
    difficulty: "Kolay",
    question: "Sumeru'da Nilou'nun dans ettiği ve Nahida'nın doğum gününün kutlandığı en büyük festivalin adı nedir?",
    answers: ["Sabzeruz Festivali", "Sabzeruz"],
    hint: "Gezgin'in zaman döngüsünde sıkışıp kaldığı meşhur bayram."
  },
  {
    id: 184,
    category: "Sumeru & Orman",
    difficulty: "Orta",
    question: "Alhaitham ve Kaveh'in evinde bulunan, Kaveh'in dövüşürken ve harita çizerken kullandığı konuşan bavul robotun adı nedir?",
    answers: ["Mehrak"],
    hint: "Kaveh'in omzunda uçan sevimli mekanik çanta."
  },
  {
    id: 185,
    category: "Inazuma & Youkai",
    difficulty: "Orta",
    question: "Sangonomiya Tapınağı'nın altındaki derin yarıktan girilen, yapay bir güneşe sahip antik yeraltı medeniyetinin adı nedir?",
    answers: ["Enkanomiya", "Byakuyakoku"],
    hint: "Yılan tanrı Orobashi'nin halkını kurtardığı ışıksız diyar."
  },
  {
    id: 186,
    category: "Inazuma & Youkai",
    difficulty: "Zor",
    question: "Enkanomiya'da yapay güneşi üreten ve Gece/Gündüz geçişini sağlayan devasa kulenin adı nedir?",
    answers: ["Dainichi Mikoshi"],
    hint: "Güneşin Arabası anlamına gelen antik kule."
  },
  {
    id: 187,
    category: "Inazuma & Youkai",
    difficulty: "Zor",
    question: "Enkanomiya medeniyetinde yozlaşmış soylular tarafından kukla kral yapılıp güneşe kurban edilen talihsiz çocuklara ne denirdi?",
    answers: ["Sunchildren", "Güneş Çocukları"],
    hint: "Ruhları tapınaklarda Gezgin'i bekleyen çocuk hükümdarlar."
  },
  {
    id: 188,
    category: "Inazuma & Youkai",
    difficulty: "Zor",
    question: "Yae Miko'nun çocukluk akıl hocası olan ve 500 yıl önceki felakette kendini feda eden efsanevi beyaz tilki Youkai kimdir?",
    answers: ["Kitsune Saiguu", "Hakushin"],
    hint: "Kazari/Hanachirusato'nun anılarını taşıdığı yüce rahibe tilki."
  },
  {
    id: 189,
    category: "Inazuma & Youkai",
    difficulty: "Orta",
    question: "Tsurumi Adası'nı sisle kaplayan ve küçük çocuk Ruu'nun şarkısına hayran kalan kadim gök kuşu bossunun adı nedir?",
    answers: ["Kanna Kapatcir", "Thunderbird", "Yıldırım Kuşu"],
    hint: "Raiden Ei tarafından Seirai Adası'nda yok edilen fırtına kuşu."
  },
  {
    id: 190,
    category: "Inazuma & Youkai",
    difficulty: "Orta",
    question: "Inazuma'da festival, kutlama ve kültürel işlerden sorumlu olan Kamisato Klanı'nın yönettiği komisyon hangisidir?",
    answers: ["Yashiro Komisyonu", "Yashiro"],
    hint: "Ayato ve Ayaka'nın başında bulunduğu komisyon."
  },
  {
    id: 191,
    category: "Inazuma & Youkai",
    difficulty: "Orta",
    question: "Kujou Sara'nın baş generali olduğu, Inazuma'da asayiş, ordu ve güvenlikten sorumlu olan komisyon hangisidir?",
    answers: ["Tenryou Komisyonu", "Tenryou"],
    hint: "Kujou Klanı'nın yönettiği askeri komisyon."
  },
  {
    id: 192,
    category: "Inazuma & Youkai",
    difficulty: "Orta",
    question: "Ritou Limanı'nda yabancılardan vergi toplayan ve Hiiragi Klanı tarafından yönetilen maliye komisyonu hangisidir?",
    answers: ["Kanjou Komisyonu", "Kanjou"],
    hint: "Inazuma'ya ilk ayak bastığımızda bize zorluk çıkaran komisyon."
  },
  {
    id: 193,
    category: "Liyue & Adeptus",
    difficulty: "Zor",
    question: "The Chasm (Uçurum) madenlerinin derinliğinde zaman boşluğunda kalan ve Xiao'nun fedakarlığını görüp onu kurtaran Electro Yaksha kimdir?",
    answers: ["Bosacius", "Mare Jivari"],
    hint: "Dört kollu kudretli Yaksha lideri."
  },
  {
    id: 194,
    category: "Liyue & Adeptus",
    difficulty: "Orta",
    question: "Shenhe'nin aşırı öfkesini, cinnetini ve insan öldürme dürtüsünü bastırmak için ustası Cloud Retainer vücuduna ne bağlamıştır?",
    answers: ["Kırmızı İpler", "Kırmızı İp", "Red Ropes"],
    hint: "Bileklerinde ve saçlarında parlayan kırmızı bağlar."
  },
  {
    id: 195,
    category: "Liyue & Adeptus",
    difficulty: "Kolay",
    question: "Hu Tao'nun etrafında sürekli uçuşan, insanları korkutmayı seven sevimli hayaletin adı nedir?",
    answers: ["Boo Tao", "Hayalet"],
    hint: "Wangsheng Cenaze Evi'nin küçük maskotu."
  },
  {
    id: 196,
    category: "Liyue & Adeptus",
    difficulty: "Zor",
    question: "Zhongli'nin Archon Savaşı sırasında koruyamadığı, halkı tarafından bıçaklanıp tuza dönüşen acımasız kadere sahip Tuz Tanrısı kimdir?",
    answers: ["Havria", "Tuz Tanrısı Havria"],
    hint: "Sal Terrae kalıntılarında tapınağı bulunan narin tanrıça."
  },
  {
    id: 197,
    category: "Liyue & Adeptus",
    difficulty: "Orta",
    question: "Chenyu Vadisi'nde sazan balığı formunda yaşayan ve Gezgin ile vadiyi arındıran zarif su Adeptus'unun adı nedir?",
    answers: ["Fujin", "Bayan Fujin"],
    hint: "Çay dağlarının koruyucu perisi."
  },
  {
    id: 198,
    category: "Liyue & Adeptus",
    difficulty: "Orta",
    question: "Liyue Limanı açıklarında Osial yenildikten sonra intikam almak için tsunamilerle saldıran Osial'in eşi dev deniz canavarı kimdir?",
    answers: ["Beisht", "Osial'in Eşi"],
    hint: "Shenhe'nin tek bir vuruşla dalgalarını dondurduğu çok başlı canavar."
  },
  {
    id: 199,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Orta",
    question: "Favonius Şövalyeleri'ni kuran, Mondstadt'ı kölelikten kurtaran ve Celestia'ya şahin olarak yükselen ilk kahraman kadın kimdir?",
    answers: ["Vennessa", "Vanessa"],
    hint: "Kızıl saçlı güney kabile savaşçısı."
  },
  {
    id: 200,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Orta",
    question: "Eski Mondstadt'ta fırtınalarla şehri çevreleyen ve Venti ile isyancılar tarafından devrilen zalim Fırtına Tanrısı kimdir?",
    answers: ["Decarabian"],
    hint: "Stormterror's Lair kalesinin eski sahibi."
  },
  {
    id: 201,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Orta",
    question: "Venti'nin 2600 yıl önce bedenini ve arpını kopyaladığı, fırtına tanrısına karşı isyanda hayatını kaybeden çocuk kimdir?",
    answers: ["Nameless Bard", "İsimsiz Ozan", "Ozan Çocuk"],
    hint: "Venti'nin yeşil pelerinini ve örgülerini borçlu olduğu arkadaşı."
  },
  {
    id: 202,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Zor",
    question: "Diluc'un babası Crepus'un araba konvoyuna saldıran ve onu sahte Delusion kullanmaya iten ejderha canavarın adı nedir?",
    answers: ["Ursa the Drake", "Ursa"],
    hint: "Mondstadt topraklarında asırlarca terör estiren kadim ejderha."
  },
  {
    id: 203,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Kolay",
    question: "Diona'nın barmenlik yaptığı, Margaret'in işlettiği Mondstadt'ın kedi temalı popüler meyhanesi neresidir?",
    answers: ["Cat's Tail", "Kedi Kuyruğu", "Cats Tail"],
    hint: "Diluc'un Angel's Share barının en büyük rakibi."
  },
  {
    id: 204,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Orta",
    question: "Diona'nın hazırladığı her içkinin büyüleyici derecede lezzetli olmasını sağlayan Springvale perisinin adı nedir?",
    answers: ["Callirhoe", "Bahar Perisi", "Spring Fairy"],
    hint: "Yaşlı Finch'in havuz başında yıllarca yolunu gözlediği Okyanus Perisi."
  },
  {
    id: 205,
    category: "Mondstadt & Şövalyeler",
    difficulty: "Zor",
    question: "Venti'nin oyunda fırtınayı dindirmek için Gezgin'le birlikte kiliseden çaldığı kutsal Mondstadt lirinin adı nedir?",
    answers: ["Holy Lyre der Himmel", "Der Himmel", "Holy Lyre"],
    hint: "Sonradan Signora tarafından kırılan kutsal çalgı."
  },
  {
    id: 206,
    category: "Silahlar & Eserler",
    difficulty: "Kolay",
    question: "Hu Tao'nun imzalı 5 yıldızlı kırmızı mızrağının adı nedir?",
    answers: ["Staff of Homa", "Homa Asası", "Homa"],
    hint: "Wangsheng arınma törenlerinde yakılan alevli asa."
  },
  {
    id: 207,
    category: "Silahlar & Eserler",
    difficulty: "Kolay",
    question: "Raiden Shogun'un imzalı 5 yıldızlı parlayan naginata mızrağının adı nedir?",
    answers: ["Engulfing Lightning", "Yutan Yıldırım"],
    hint: "Enerji yüklemesine (Energy Recharge) göre saldırı bonusu veren mızrak."
  },
  {
    id: 208,
    category: "Silahlar & Eserler",
    difficulty: "Orta",
    question: "Kamisato Ayaka'nın imzalı 5 yıldızlı mor katana kılıcının adı nedir?",
    answers: ["Mistsplitter Reforged", "Mistsplitter", "Sis Kesen"],
    hint: "Kırıldıktan sonra yeniden dövülen şimşek katana."
  },
  {
    id: 209,
    category: "Silahlar & Eserler",
    difficulty: "Orta",
    question: "Kaedehara Kazuha'nın imzalı 5 yıldızlı mavi şövalye kılıcının adı nedir?",
    answers: ["Freedom-Sworn", "Özgürlük Yemini"],
    hint: "Takıma elemental ustalık ve normal saldırı güçlendirmesi veren kılıç."
  },
  {
    id: 210,
    category: "Silahlar & Eserler",
    difficulty: "Orta",
    question: "Neuvillette'in imzalı 5 yıldızlı parlayan mavi su büyü kitabının adı nedir?",
    answers: ["Tome of the Eternal Flow", "Tome of Eternal Flow"],
    hint: "Yüklü saldırı hasarını ve can değişimini güçlendiren katalizör."
  },
  {
    id: 211,
    category: "Silahlar & Eserler",
    difficulty: "Kolay",
    question: "Genshin'de 5 parçalık eser (Artifact) setlerinde tam set bonusunu açmak için en az kaç parça takılmalıdır?",
    answers: ["4", "Dört", "4 Parça"],
    hint: "2 parça ilk bonusu, ... parça ise ana seti aktive eder."
  },
  {
    id: 212,
    category: "Silahlar & Eserler",
    difficulty: "Kolay",
    question: "Eserlerde (Artifact) Ana İstatistiği daima sabit olarak DÜZ CAN (Flat HP) veren parça hangisidir?",
    answers: ["Çiçek", "Flower of Life", "Yaşam Çiçeği", "Flower"],
    hint: "Sol üstteki ilk eser yuvası."
  },
  {
    id: 213,
    category: "Silahlar & Eserler",
    difficulty: "Kolay",
    question: "Eserlerde (Artifact) Ana İstatistiği daima sabit olarak DÜZ SALDIRI (Flat ATK) veren parça hangisidir?",
    answers: ["Tüy", "Plume of Death", "Ölüm Tüyü", "Plume", "Feather"],
    hint: "Çiçeğin hemen sağındaki ikinci eser yuvası."
  },
  {
    id: 214,
    category: "Silahlar & Eserler",
    difficulty: "Orta",
    question: "Swirl (Girdap) reaksiyonu tetiklendiğinde düşmanın o elemente direncini %40 düşüren en popüler Anemo eser seti nedir?",
    answers: ["Viridescent Venerer", "Zümrüt Gölge", "VV"],
    hint: "Kazuha, Sucrose ve Venti'nin vazgeçilmez seti."
  },
  {
    id: 215,
    category: "Silahlar & Eserler",
    difficulty: "Orta",
    question: "Karakterin Enerji Yüklemesine (Energy Recharge) oranla Element Patlaması (Burst) hasarını artıran Inazuma seti nedir?",
    answers: ["Emblem of Severed Fate", "Kader Amblemi", "Emblem"],
    hint: "Raiden, Xiangling ve Xingqiu için Momiji-Dyed Court'tan düşen set."
  },
  {
    id: 216,
    category: "Silahlar & Eserler",
    difficulty: "Orta",
    question: "Karakterin Element Becerisi vurduğunda tüm takıma %20 Saldırı ve kalkan güçlendirmesi veren Liyue maden seti nedir?",
    answers: ["Tenacity of the Millelith", "Millelith'in Kararlılığı", "Tenacity", "Millelith"],
    hint: "Zhongli ve Layla'nın canını artıran set."
  },
  {
    id: 217,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Orta",
    question: "Tartaglia'nın (Childe) haftalık boss savaşında üçüncü aşamada büründüğü mor maskeli ve zırhlı formun adı nedir?",
    answers: ["Foul Legacy", "Kusursuz Miras", "Kusursuz Miras Formu"],
    hint: "Electro ve Hydro güçlerini aynı anda kullandığı karanlık zırhı."
  },
  {
    id: 218,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Zor",
    question: "Raiden Shogun'un haftalık boss savaşındaki dev mekanik zırhlı formunun resmi adı nedir?",
    answers: ["Magatsu Mitake Narukami no Mikoto", "Magatsu Mitake", "Raiden Boss"],
    hint: "Dev kılıç darbeleriyle tek vuruşta öldürebilen kukla formu."
  },
  {
    id: 219,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Orta",
    question: "Sumeru Akademisi'nin Scaramouche'tan yarattığı yapay mekanik haftalık bossun resmi adı nedir?",
    answers: ["Shouki no Kami", "The Prodigal", "Savurgan Tanrı"],
    hint: "Gezgin'in yanında küçük uçan yeşil yardımcı robotla yendiği dev mecha."
  },
  {
    id: 220,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Kolay",
    question: "Fontaine'de Opera Epiclese sahnesinde mekanik vals yaparak Cryo ve Anemo saldırıları gerçekleştiren ikili robot boss kimdir?",
    answers: ["Icewind Suite", "Coppelia ve Coppelius", "Coppelia"],
    hint: "Buz ve rüzgar dansçıları mekanik çift."
  },
  {
    id: 221,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Kolay",
    question: "Hilichurl kabilelerinde dans ederek element sütunları çıkaran ve yağmur çağıran minik şamanlara ne ad verilir?",
    answers: ["Samachurl", "Samachurller", "Şamaçörl"],
    hint: "Ellerinde asa taşıyan ve çocuk gibi dans eden maskeli büyücüler."
  },
  {
    id: 222,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Kolay",
    question: "Hilichurl'ların elinde koca ahşap/kaya kalkanı veya alevli balta taşıyan iri savaşçılarına ne denir?",
    answers: ["Mitachurl", "Mitachurller", "Mitaçörl"],
    hint: "Üzerinize boynuzlarıyla veya kalkanıyla hücum eden iri yaratıklar."
  },
  {
    id: 223,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Orta",
    question: "Hilichurl ırkının en devasa, taştan veya buzdan zırh giyip yerleri sarsan elit şeflerine ne ad verilir?",
    answers: ["Lawachurl", "Lawachurller", "Lavaçörl"],
    hint: "Stonehide veya Frostarm lakaplı dev cüsseli Hilichurl kralları."
  },
  {
    id: 224,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Kolay",
    question: "Teyvat'ta sandıkların üzerinde uyuklayan, takım elbiseli ve çantalı 'Tuhaf Hilichurl'a oyuncular hangi takma adı verir?",
    answers: ["Wei", "Da Wei", "Unusual Hilichurl"],
    hint: "miHoYo'nun kurucusu Liu Wei'yi temsil eden özel maskot canavar."
  },
  {
    id: 225,
    category: "Düşmanlar & Canavarlar",
    difficulty: "Kolay",
    question: "Mondstadt'ta rüzgar bariyerleri oluşturan ve ortasında parlayan bir küre bulunan kanatsız uçan canavar nedir?",
    answers: ["Eye of the Storm", "Fırtınanın Gözü"],
    hint: "Okçularla vurulduğunda yere düşen küre yaratık."
  },
  {
    id: 226,
    category: "Oyun Mekanikleri",
    difficulty: "Kolay",
    question: "Dendro ve Pyro elementleri birleştiğinde düşmanı alevler içinde yakmaya devam eden sürekli hasar reaksiyonu nedir?",
    answers: ["Burning", "Yanma"],
    hint: "Çimenlerin alev almasıyla Gezgin'i bile yakan reaksiyon."
  },
  {
    id: 227,
    category: "Oyun Mekanikleri",
    difficulty: "Orta",
    question: "Yerdeki yeşil Dendro (Bloom) çekirdeğine Electro elementi vurulduğunda güdümlü füzeler fırlatan reaksiyon nedir?",
    answers: ["Hyperbloom", "Aşırı Çiçeklenme"],
    hint: "Kuki Shinobu ve Raiden Shogun ile harikalar yaratan yeşil güdümlü mermiler."
  },
  {
    id: 228,
    category: "Oyun Mekanikleri",
    difficulty: "Orta",
    question: "Yerdeki yeşil Dendro (Bloom) çekirdeğine Pyro elementi vurulduğunda anında patlayarak alan hasarı veren reaksiyon nedir?",
    answers: ["Burgeon", "Filizlenme"],
    hint: "Thoma'nın en çok tercih edildiği Dendro çekirdek patlatma reaksiyonu."
  },
  {
    id: 229,
    category: "Oyun Mekanikleri",
    difficulty: "Orta",
    question: "Düşmana Dendro + Electro vurulup Quicken oluşturulduktan sonra ek Electro vurulursa tetiklenen reaksiyon nedir?",
    answers: ["Aggravate", "Şiddetlenme"],
    hint: "Keqing ve Yae Miko'nun hasarını katlayan reaksiyon."
  },
  {
    id: 230,
    category: "Oyun Mekanikleri",
    difficulty: "Orta",
    question: "Quicken durumundaki düşmana ek Dendro hasarı vurulduğunda tetiklenen ve Dendro hasarını artıran reaksiyon nedir?",
    answers: ["Spread", "Yayılma"],
    hint: "Alhaitham ve Tighnari'nin vuruşlarını güçlendiren reaksiyon."
  },
  {
    id: 231,
    category: "Oyun Mekanikleri",
    difficulty: "Kolay",
    question: "Takımda 2 adet Pyro karakteri bulunduğunda tüm takımın Saldırı (ATK) gücünü yüzde kaç artırır?",
    answers: ["%25", "25", "Yüzde 25"],
    hint: "Alev uyumunun sağladığı çeyrek oranındaki güçlendirme."
  },
  {
    id: 232,
    category: "Oyun Mekanikleri",
    difficulty: "Kolay",
    question: "Takımda 2 adet Hydro karakteri bulunduğunda tüm takımın Maksimum Can (Max HP) değerini yüzde kaç artırır?",
    answers: ["%25", "25", "Yüzde 25"],
    hint: "Neuvillette, Furina ve Hu Tao'nun en sevdiği can rezonansı bonusu."
  },
  {
    id: 233,
    category: "Oyun Mekanikleri",
    difficulty: "Kolay",
    question: "Bir karakterin yetenek seviyesini (Talent) 9'dan 10'a çıkarmak için gereken en nadir taç eşyası nedir?",
    answers: ["Crown of Insight", "İçgörü Tacı", "Crown", "Taç"],
    hint: "Sadece özel etkinliklerden ve kutsal ağaçlardan elde edilen taç."
  },
  {
    id: 234,
    category: "Oyun Mekanikleri",
    difficulty: "Kolay",
    question: "Bir karakteri ve silahı maksimum 90 seviyeye çıkarmak için toplam kaç kez Yükseltme (Ascension) yapılmalıdır?",
    answers: ["6", "Altı", "6 Kez"],
    hint: "20, 40, 50, 60, 70 ve 80 seviyelerinde yapılan yıldız kırma aşaması."
  },
  {
    id: 235,
    category: "Oyun Mekanikleri",
    difficulty: "Orta",
    question: "Genshin Impact 5.0 güncellemesinde 50/50 şansını kaybettiğinizde devreye girip 5 yıldızı kazandıran yeni sistemin adı nedir?",
    answers: ["Capturing Radiance", "Yakalayan Işıltı", "Radiance"],
    hint: "Dilek çekerken ekranın pembe/altın ışıltıyla parlamasını sağlayan afiş mekanizması."
  },
  {
    id: 236,
    category: "Sistem & Ev",
    difficulty: "Kolay",
    question: "Gezgin'e kendi evini ve dünyasını inşa edebileceği 'Serenitea Pot' (Çaydanlık) hediyesini veren yaşlı Liyueli Adeptus kimdir?",
    answers: ["Madame Ping", "Ping", "Streetward Rambler"],
    hint: "Yunjin ve Yaoyao'nun ninesi gibi olan ulu saz ustası."
  },
  {
    id: 237,
    category: "Sistem & Ev",
    difficulty: "Kolay",
    question: "Serenitea Pot çaydanlık dünyamızda bizi karşılayan, mobilya üreten sevimli kuş şeklindeki kahyanın adı nedir?",
    answers: ["Tubby", "Tobi"],
    hint: "Girişte çaydanlığın üzerinde oturan tombul mavi kuş."
  },
  {
    id: 238,
    category: "Sistem & Ev",
    difficulty: "Orta",
    question: "Genshin Impact'in popüler masaüstü kart oyunu 'Genius Invokation TCG' aslen ilk olarak hangi ülkede icat edilmiştir?",
    answers: ["Sumeru"],
    hint: "Cyno'nun çılgınlar gibi oynadığı kart oyununun anavatanı olan bilgi şehri."
  },
  {
    id: 239,
    category: "Genel Kültür",
    difficulty: "Kolay",
    question: "Genshin Impact'in Mondstadt, Liyue ve Inazuma müziklerini besteleyen ve oyun dünyasında efsaneleşen eski baş besteci kimdir?",
    answers: ["Yu-Peng Chen", "Chen", "HOYO-MiX"],
    hint: "Şanghay Senfoni Orkestrası ile Genshin konserlerini yöneten dahi müzisyen."
  },
  {
    id: 240,
    category: "Genel Kültür",
    difficulty: "Kolay",
    question: "Teyvat'ta her hafta Pazartesi günü sunucu saatiyle saat tam kaçta tüm haftalık bosslar ve zindanlar sıfırlanır?",
    answers: ["04:00", "4", "Sabah 4", "04.00"],
    hint: "Sabahın ilk saatlerinde günlük görevin yenilendiği saat."
  },
  {
    id: 241,
    category: "Karakterler & Hikaye",
    difficulty: "Orta",
    question: "Mondstadt'ın karlı dağı Dragonspine'da Albedo'nun geçmişte simyayla çöpe atılan ve intikam almak isteyen sahte kopyasına ne denir?",
    answers: ["Subject Two", "İkinci Denek", "Fell Albedo", "Sahte Albedo"],
    hint: "Boğazında yıldız izi bulunmayan çiçekli Albedo kopyası."
  },
  {
    id: 242,
    category: "Karakterler & Hikaye",
    difficulty: "Orta",
    question: "Varka sefere çıkarken Mondstadt'taki bütün atları yanında götürdüğü için Kaeya'nın sahip olduğu ironik unvan nedir?",
    answers: ["Süvari Kaptanı", "Cavalry Captain", "Süvariler Yüzbaşısı"],
    hint: "Atı olmayan süvari komutanı."
  },
  {
    id: 243,
    category: "Karakterler & Hikaye",
    difficulty: "Kolay",
    question: "Oyunun başında Paimon'u bir nehirde boğulurken oltayla kurtardığımız Mondstadt gölünün adı nedir?",
    answers: ["Starfell Lake", "Yıldızdüşen Gölü", "Starfell"],
    hint: "Ortasında Barbatos'un ilk Yedi Heykeli bulunan kutsal göl."
  },
  {
    id: 244,
    category: "Karakterler & Hikaye",
    difficulty: "Kolay",
    question: "Amber'ın dövüşürken düşmanların dikkatini dağıtmak için yere fırlattığı dans eden oyuncak tavşanın adı nedir?",
    answers: ["Baron Bunny", "Tavşan Baron"],
    hint: "Geri sayım bittiğinde patlayan dansçı kırmızı tavşan."
  },
  {
    id: 245,
    category: "Karakterler & Hikaye",
    difficulty: "Orta",
    question: "Keqing'in odasında gizlice sakladığı ve kimseye göstermek istemediği figür koleksiyonu kime aittir?",
    answers: ["Zhongli", "Rex Lapis", "Morax"],
    hint: "Her ne kadar tanrılara inanmasa da hayranı olduğu Toprak Tanrısı."
  },
  {
    id: 246,
    category: "Karakterler & Hikaye",
    difficulty: "Orta",
    question: "Sayou'nun sırtında taşıdığı ve ninja tekniklerinde içine saklandığı yeşil yapraklı sevimli maskot yaratık nedir?",
    answers: ["Mujina", "Porsuk"],
    hint: "Sürekli kedi veya tilkiyle karıştırılan ama kendisinin şiddetle reddettiği hayvan."
  },
  {
    id: 247,
    category: "Karakterler & Hikaye",
    difficulty: "Orta",
    question: "Gorou'nun kadın kılığına girerek Yae Yayınevi'nde mektuplara hayat tavsiyesi yazdığı takma adı nedir?",
    answers: ["Bayan Hina", "Ms. Hina", "Hina"],
    hint: "Itto'nun hayranı olduğu köpek kulaklı bilge kadın köşesi."
  },
  {
    id: 248,
    category: "Karakterler & Hikaye",
    difficulty: "Zor",
    question: "Dendro Archon Nahida'nın doğumunu ve Kusanali unvanını borçlu olduğu, Irminsul'un en saf dalından kopardığı ilahi kökeni nedir?",
    answers: ["Irminsul Dalı", "Saf Irminsul Dalı", "Rukkhadevata'nın Dalı"],
    hint: "Büyük Lord Rukkhadevata'nın son hatırası olarak dünyaya bıraktığı temiz sürgün."
  },
  {
    id: 249,
    category: "Karakterler & Hikaye",
    difficulty: "Kolay",
    question: "Fontaine'de hapishane olarak kullanılan ve denizin kilometrelerce dibine inşa edilen devasa tesisin adı nedir?",
    answers: ["Fortress of Meropide", "Meropide Kalesi", "Meropide"],
    hint: "Dük Wriothesley'in yönettiği denizaltı kalesi."
  },
  {
    id: 250,
    category: "Genel Kültür",
    difficulty: "Kolay",
    question: "Teyvat'ta Gezgin'e daima 'Yıldızlara ve Uçurumlara Doğru!' (Ad astra abyssosque!) diyerek görev veren kurum hangisidir?",
    answers: ["Macera Loncası", "Adventurers' Guild", "Adventurers Guild"],
    hint: "Her şehirde Katheryne'in danışma masasında durduğu uluslararası kuruluş."
  }
];

console.log(`Eklenecek yeni soru sayısı: ${newQuestions.length}`);

// Combine
const combined = [...existingQuestions, ...newQuestions];

// Validate IDs and uniqueness
const ids = new Set();
combined.forEach((q, idx) => {
  q.id = idx + 1; // Re-index sequentially 1..250
  if (ids.has(q.id)) {
    throw new Error(`Duplicate id ${q.id}`);
  }
  ids.add(q.id);
  if (!q.question || q.question.length < 5) throw new Error(`Invalid question at ${idx}`);
  if (!Array.isArray(q.answers) || q.answers.length === 0) throw new Error(`Invalid answers at ${idx}`);
  if (!q.category) throw new Error(`Missing category at ${idx}`);
  if (!q.difficulty) throw new Error(`Missing difficulty at ${idx}`);
});

fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(combined, null, 2), 'utf8');
console.log(`✅ Başarıyla ${combined.length} adet soru questions.json dosyasına yazıldı!`);
