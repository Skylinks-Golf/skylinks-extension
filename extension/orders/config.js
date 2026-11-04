/* Skylinks Pro Shop Orders — settings. Edit vendor contacts, portals and delivery notes here. */
const V={
 GOLD:{n:"GoldenBrands",p:"510-609-2922",m:"portal",c:"Tom",e:"TBuccelatto@reyesholdings.com",url:"https://www.sipmarket.com/",cad:"Delivers Wed Nov 11 (order by Tue) · next Dec 9",g:1},
 BRKT:{n:"Breakthru Bev",m:"portal",c:"JT",e:"",url:"https://now.breakthrubev.com/bbg/en/login?targetUrl=%2Fbbg%2Fen%2F",cad:"",g:1},
 MARK:{n:"Markstein Sales Co.",p:"925-383-2164",m:"portal",c:"Mike",e:"mpierce@markstein1919.com",url:"https://apps.vtinfo.com/retailer-portal/",cad:"Every 4 weeks, Thu delivery · Nov 3 order still open in portal",g:1},
 SFNA:{n:"SF Naturals",p:"831-251-8801",m:"portal",c:"Peter",e:"peter@sfnaturals.net",url:"https://sfnaturals.pepr.app/",cad:"",g:1},
 SOUT:{n:"Southern Wine",p:"325-435-6900",m:"portal",c:"Diana",e:"DianaValencia@sgws.com",url:"https://shop.sgproof.com/",cad:"",g:1},
 MUSC:{n:"Muscle Foods USA",p:"725-313-2061",m:"portal",c:"Alex",e:"aperez@musclefoodsusa.com",url:"https://shop.musclefoodsusa.com/",cad:"",g:1},
 MIND:{n:"Mindful",p:"408-449-0708",m:"email",c:"Clayton",e:"Clayton@mindfuld.com",cad:"",g:2},
 DELT:{n:"Delta Pacific",p:"925-330-6792",m:"email",c:"Paul",e:"Paul.Klevan@Deltapacificbev.com",cad:"About monthly, mid-week (guess)",g:2},
 REPR:{n:"RepRally",p:"510-691-4964",m:"email",c:"Sie",e:"siesavagechambers@gmail.com",cad:"",g:2},
 HLTR:{n:"HL Trading Company",m:"email",c:"Ron",e:"ron@hltradingcompany.com",cad:"",g:2},
 ALTA:{n:"Altamont",p:"925-290-8440",m:"email",c:"Jake",e:"jake@altamontbeerworks.com",cad:"About monthly, late month, Tue/Thu (guess)",g:3},
 ALAM:{n:"Alameda Brewing",p:"510-217-8885",m:"email",c:"Anthony",e:"",cad:"Tuesdays, every 4–6 weeks (guess)",g:3},
 EPID:{n:"Epidemic Ales",p:"209-699-2628",m:"email",c:"Jordan",e:"Holly@epidemicales.com",cad:"Every 4–8 weeks, mid-week (guess)",g:3},
 DELC:{n:"Del Cielo Brewery",p:"925-917-1603",m:"email",c:"Dave",e:"Saleseast@delcielobrewing.com",cad:"About monthly, Tue/Thu (guess)",g:3},
 WEST:{n:"Western Flyer",m:"email",c:"Matt",e:"matt@wfbrewing.com",cad:"",g:3},
 "5SUN":{n:"5 Suns",m:"email",c:"",e:"",cad:"About every 2 months, Thursday (guess)",g:3},
 SAMS:{n:"Sam's Club",url:"https://www.samsclub.com/",m:"portal",c:"",e:"",cad:"As needed",g:4},
 NONE:{n:"No vendor assigned",m:"none",c:"",e:"",cad:"—",g:5},
 TITL:{n:"Titleist",m:"email",c:"Ted",e:"",cad:"Monthly",g:6},VWGO:{n:"VW Golf",p:"925-383-9928",m:"email",c:"Jackie",e:"",cad:"Monthly",g:6}
};

/* Lightspeed vendor name -> code above. Vendors not listed show up by their Lightspeed name. */
const NAME2CODE={"GoldenBrands":"GOLD","Breakthru Bev":"BRKT","Markstein Sales Co.":"MARK","SF Naturals":"SFNA","Southern Wine":"SOUT","Muscle Foods USA":"MUSC","Mindful":"MIND","Delta Pacific":"DELT","RepRally":"REPR","HL Trading Company":"HLTR","Altamont":"ALTA","Alameda Brewing":"ALAM","Epidemic Ales":"EPID","Del Cielo Brewery":"DELC","Western Flyer":"WEST","5 Suns":"5SUN","Sam's Club":"SAMS","None":"NONE","Titleist":"TITL","VW Golf":"VWGO"};
/* Weeks of cover by vendor group: 1 portals, 2 reps, 3 local breweries, 4 store, 5 none, 6 merch */
const COVER_BY_GROUP={1:1.5,2:1.5,3:2.5,4:1.5,5:1.5,6:4};
const LOCAL_CODES=['5SUN','ALAM','ALTA','DELC','EPID','WEST'];
/* Items that are services or made in-house (never ordered) */
const SERVICE_RX=/^(9 Hole|Range Balls|Lesson|Golf |Golf -|Push Cart|Gift Card|Regrip|Member|Driving Range|Wine Glass|Skylinks Birthday|School Golf)/;
const INHOUSE_RX=/^(Coffee|Margi Slushie|Cantina Cocktails)$/;
/* Case-size fallbacks when an item has no matching [CASE] item in Lightspeed. First match wins. */
const PACK_RULES=[[/KEG/,41],[/Shooter|50 ?ml|1\.7oz/i,120],[/Coors Light/,15],[/Coors Banquet|Miller Lite|Corona - Extra - 12oz/,18],[/Sierra Nevada - .*19\.2|Voodoo Ranger|Elysian|Kona|Maximus|Mango Cart Mas/,15],
 [/Gatorade - .*28oz/,15],[/Gatorade - .*20oz/,24],[/Crystal Geyser/,24],[/Coke - Zero/,35],[/^Soda - /,12],[/Caprisun/,40],[/Arizona/,24],[/Red Bull|Monster/,24],
 [/Pocky|Hostess - Mini/,10],[/Candy - (Snickers|M&Ms)/,48],[/^Candy - Skittles - Sour/,24],[/^Candy - /,36],[/^Chips - .*Cheetos - (Crunchy|Flamin)/,32],[/^Chips - /,24],
 [/Wylers/,96],[/Outshine/,36],[/Drumstick|Otter Pop|Kit-Kat - Cone/,16],[/Fatboy/,18],
 [/Sabe|Buzz Ball|Flybird|Craftwell|Archer Roose|Truly - .*12oz|White Claw - .*12oz|Twisted Tea - .* - 12oz/,24],[/Monaco|Kyla|375ml|355ml|750ml/,12],
 [/ - 2[345](\.\d)?\s?oz| - 19(\.2)?\s?oz/,12],[/ - 1[26]\s?oz/,24]];
