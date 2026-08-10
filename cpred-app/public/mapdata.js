// Night City district, location, faction and map-georeference data.
// District/location/faction facts and the base map image come from the
// "Night City Atlas" DLC (c) R. Talsorian Games, used under the owner's
// licence for their own game table. Location pin coordinates were derived by
// detecting the map's own label boxes, so pins land exactly on the printed
// map. Categories, zones, threat ratings and the faction index are derived
// in this repo.
// Generated - do not hand-edit; regenerate from the Atlas source instead.
const NC_MAP = {
  "image": "assets/nightcity-map.jpg",
  "imgW": 6600,
  "imgH": 9794,
  "worldW": 100,
  "worldH": 148.394,
  "credit": "Night City map (c) 2025 R. Talsorian Games - Night City Atlas DLC"
};

const NC_MAP_DATA = [{"code":"A","name":"Little Europe","region":"The Island","description":"A district divided between classes and times, with old brick buildings standing next to futuristic skyscrapers.","cityManager":"Amanda Polishchuk (elected by property owners)","securityProvider":"NCPD","gangs":["6th Street","Eurotrashers","Maelstrom","Undertow"],"locations":[{"code":"A1","name":"Camden Court","desc":"A secure apartment complex favored by Solos and Execs.","cat":"lodging","u":0.35962,"v":0.37319,"x":35.962,"z":55.379},{"code":"A2","name":"Chopper’s","desc":"Formerly a butcher’s shop, now a bar. The meat grinder still works if you want to get rid of a body.","cat":"bar","u":0.38008,"v":0.41964,"x":38.008,"z":62.273},{"code":"A3","name":"Continental Brands Vertical","desc":"Neighborhood: Housing for Continental Brands employees. A nightmare to navigate due to its “flavors of the world” theming.","cat":"corporation","u":0.34932,"v":0.40969,"x":34.932,"z":60.795},{"code":"A4","name":"Cube-A-Rama","desc":"A cube hotel with an original brick exterior.","cat":"lodging","u":0.39144,"v":0.40173,"x":39.144,"z":59.614},{"code":"A5","name":"Danger Gal Housing Facility","desc":"Housing for Danger Gal employees. Pink and full of life.","cat":"organization","u":0.29773,"v":0.38712,"x":29.773,"z":57.447},{"code":"A6","name":"Danger Gal Offices","desc":"Home base for Danger Gal, a private investigation and security Neocorp.","cat":"corporation","u":0.30553,"v":0.39187,"x":30.553,"z":58.152},{"code":"A7","name":"Fiddler’s Green","desc":"An “Irish” pub that’s about as Irish as green beer on Saint Patty’s day.","cat":"bar","u":0.35462,"v":0.3857,"x":35.462,"z":57.235},{"code":"A8","name":"Greta’s","desc":"The best pool hall in Night City, with a strong lesbian client base.","cat":"entertainment","u":0.42553,"v":0.38815,"x":42.553,"z":57.599},{"code":"A9","name":"Holy Angels Church","desc":"A Catholic church run by Father Kevin and Father Paul. Known far and wide as neutral ground in Night City.","cat":"landmark","u":0.33205,"v":0.38764,"x":33.205,"z":57.523},{"code":"A10","name":"Paradiso Terrestre","desc":"An upscale Southern Neo-Italian dining experience. Meals by appointment only.","cat":"food","u":0.35697,"v":0.41643,"x":35.697,"z":61.795},{"code":"A11","name":"Short Circuit","desc":"Night City’s premiere Tech and Netrunner bar. Owned and operated by Brain and his husband 3-Piece.","cat":"bar","u":0.40439,"v":0.42026,"x":40.439,"z":62.364},{"code":"A12","name":"Soprano’s","desc":"An Italian restaurant that leans heavily into its mafioso theming. The real mob gives it a pass.","cat":"food","u":0.35038,"v":0.43598,"x":35.038,"z":64.697},{"code":"A13","name":"Torrell and Chiang’s","desc":"Considered by many to be the best tailors in Night City.","cat":"shop","u":0.36402,"v":0.44303,"x":36.402,"z":65.742}],"x":42,"z":46,"w":11,"d":10,"tier":3,"accent":"#00e5ff","threat":2,"locationCount":13,"zone":"urban","anchor":{"x":35.936,"z":60.047,"rx":6.617,"rz":5.695},"mapped":13},{"code":"B","name":"Upper Marina","region":"The Island","description":"A bustling district with a mix of old industrial zones and gentrified neighborhoods built around a series of docks and small marinas.","cityManager":"Kabria Chung (elected by property owners)","securityProvider":"NCPD","gangs":["Maelstrom","Prime-Time Players","Street Queens"],"locations":[{"code":"B1","name":"The Afterlife","desc":"The premiere edgerunner bar in Night City. Owned by the legendary Solo, Rogue.","cat":"bar","u":0.51636,"v":0.39973,"x":51.636,"z":59.318},{"code":"B2","name":"Buffalo’s","desc":"The latest in a long line of failing restaurants opened in this location. Serves global fusion cuisine.","cat":"food","u":0.44576,"v":0.38212,"x":44.576,"z":56.705},{"code":"B3","name":"City Medical Center","desc":"An enormous hospital complex housing some of the best medical staff and technology in Night City.","cat":"ripperdoc","u":0.56939,"v":0.42123,"x":56.939,"z":62.508},{"code":"B4","name":"The Garden of Earthly Delights","desc":"A full hedo\u0002nistic experience brothel. A visit starts with dinner and ends with time spent with meat puppets programmed to the client’s specifications.","cat":"entertainment","u":0.54545,"v":0.30411,"x":54.545,"z":45.129},{"code":"B5","name":"GraffitiX","desc":"An art gallery displaying the work of Night City’s best up-and-coming artists.","cat":"shop"},{"code":"B6","name":"La Lune Blue","desc":"A high-end French restaurant.","cat":"food","u":0.58924,"v":0.40321,"x":58.924,"z":59.833},{"code":"B7","name":"Marina Float Homes","desc":"A collection of small houseboats for rent.","cat":"lodging","u":0.4572,"v":0.36492,"x":45.72,"z":54.152},{"code":"B8","name":"Mc Cartney Cubes","desc":"A cube hotel near the stadium.","cat":"entertainment","u":0.51106,"v":0.376,"x":51.106,"z":55.795},{"code":"B9","name":"Mc Cartney Field Stadium","desc":"A 75,000 seat stadium and the heart of Night City’s sports and concert scene. Franchises calling the stadium home include the Slammers (Baseball), Heat (Basketball), Death Dealers (Combat Soccer), Nuke (Murderball), and the New Battlegrounds Championship Wrestling League.","cat":"entertainment","u":0.48697,"v":0.3811,"x":48.697,"z":56.553},{"code":"B10","name":"Night City Bubbles","desc":"A high-end spa. Some employees can be hired as escorts for the evening.","cat":"entertainment"},{"code":"B11","name":"REO Meatwagon Offices","desc":"Home of Night City’s second-biggest EMS operation.","cat":"corporation","u":0.61576,"v":0.41,"x":61.576,"z":60.841},{"code":"B12","name":"Travl Stay City Center","desc":"A cube hotel with paper-thin walls and absolutely no security.","cat":"lodging","u":0.43667,"v":0.38733,"x":43.667,"z":57.477},{"code":"B13","name":"Ziggurat Offices","desc":"The headquarters of Ziggurat, the company responsible for building and maintaining Citinets across the continent. Attached is the Hanging Gardens, which provides housing for employees.","cat":"corporation","u":0.59515,"v":0.39157,"x":59.515,"z":58.106}],"x":31,"z":38,"w":12,"d":9,"tier":2,"accent":"#5ce1e6","threat":2,"locationCount":13,"zone":"urban","anchor":{"x":52.446,"z":56.947,"rx":9.13,"rz":11.818},"mapped":11},{"code":"C","name":"Downtown","region":"The Island","description":"A new district carved out of Little Europe by Mister Kernighan and a consortium of Fixers and Execs known as the Chamber of Commerce. Downtown is preparing for Night City’s full rebirth by creating the most com\u0002mercially friendly district on the Island.","cityManager":"Emilia Ortega (appointed by Chamber of Commerce)","securityProvider":"Whitewater Security","gangs":["Eastern Tigers Triad","Skiv Family","Undertow"],"locations":[{"code":"C1","name":"Acadia Way","desc":"A single street containing restored bungalows, gated away from the rest of the world.","cat":"shop","u":0.32917,"v":0.43011,"x":32.917,"z":63.826},{"code":"C2","name":"Continental Brands Offices","desc":"The Night City headquarters of food juggernaut Continental Brands. Also home to the Oasis Megamart, the largest grocery store in the city.","cat":"food","u":0.32659,"v":0.40989,"x":32.659,"z":60.826},{"code":"C3","name":"Cortex Complex","desc":"An ugly office building that vaguely resembles a human brain. Home to Jack Skorkowski Real Estate and Diz Com, an industrial design firm.","cat":"other","u":0.30902,"v":0.43052,"x":30.902,"z":63.886},{"code":"C4","name":"Delirium","desc":"A gothpunk virtuality club.","cat":"bar","u":0.31523,"v":0.44752,"x":31.523,"z":66.409},{"code":"C5","name":"Night City Firestation #2","desc":"The most well\u0002funded firestation in Night City. It is well fortified, well equipped, and employs a number of FBC firefighters.","cat":"organization","u":0.30008,"v":0.43052,"x":30.008,"z":63.886}],"x":50,"z":40,"w":12,"d":11,"tier":5,"accent":"#7df9ff","threat":2,"locationCount":5,"zone":"urban","anchor":{"x":31.602,"z":63.767,"rx":1.594,"rz":2.941},"mapped":5},{"code":"D","name":"The Hot Zone","region":"The Island","description":"Formerly the central city Corporate Zone. Now, a bleak landscape riddles with twisted, wrecked skyscrapers. It shrinks a bit each year as the edges are cleared and rebuilt.","cityManager":"None","securityProvider":"NCPD (in theory)","gangs":["Lightning Cats","Maelstrom","Reckoners","various Scavver groups"],"locations":[{"code":"D1","name":"The Ashcroft Hotel","desc":"Once the most luxurious hotel in Night City. Now the center of Maelstrom’s Hot Zone scavenging operations.","cat":"lodging","u":0.52015,"v":0.43751,"x":52.015,"z":64.924},{"code":"D2","name":"The N54","desc":"The former home of Network 54 in Night City. The tallest structure still standing in the Hot Zone – climbing it and tagging the top has become a tradition among urbanauts.","cat":"corporation","u":0.45576,"v":0.45451,"x":45.576,"z":67.447},{"code":"D3","name":"Toggle’s Temple","desc":"An underground firearms range and obstacle course run by a conspiracy theorist named Toggle.","cat":"entertainment","u":0.41712,"v":0.41377,"x":41.712,"z":61.402},{"code":"D4","name":"Totentanz","desc":"A chrome metal club and home base for Maelstrom. You smmellll llike aa cop. Know whaat we ddo to ccops we catch sniffing sniffing aaroundd TTotentaanzz? WWe feedd ‘emm to The Pit! — Quake Maelstrom Lieutenant","cat":"bar","u":0.45879,"v":0.39759,"x":45.879,"z":59}],"x":50,"z":29,"w":10,"d":9,"tier":4,"accent":"#ff1744","threat":4,"locationCount":4,"zone":"combat","anchor":{"x":46.295,"z":63.193,"rx":5.72,"rz":4.254},"mapped":4},{"code":"E","name":"Little China","region":"The Island","description":"A struggling community attempting to crawl its way out of the combat zones and into the rebuilding urban center.","cityManager":"David Ling Po (appointed by the Little China Redevelopment Association)","securityProvider":"Gold Dragons","gangs":["Gold Dragons","Red Chrome Legion","Weng Fang Tong"],"locations":[{"code":"E1","name":"Bridgetown","desc":"A cargo container community stacked under the end of the Pelican Boulevard over\u0002pass. It isn’t uncommon for bodies to wash up on the waterfront nearby.","cat":"landmark","u":0.64523,"v":0.4442,"x":64.523,"z":65.917},{"code":"E2","name":"Chrome Cross","desc":"A dive bar frequented by the Red Chrome Legion.","cat":"bar","u":0.5775,"v":0.46549,"x":57.75,"z":69.076},{"code":"E3","name":"Forlorn Hope","desc":"The home of The Forlorn Hope, a venerable edgerunner bar and Night City institu\u0002tion (before the events of Tales of the RED: Hope Reborn).","cat":"bar","u":0.60659,"v":0.47401,"x":60.659,"z":70.341},{"code":"E4","name":"Guăngbō Tower","desc":"A symbol of Little China’s aspirations for the future, this restored tower houses a number of organizations and businesses, including the Ling Po Public Library and Virtex’s Virtuality Venue.","cat":"shop","u":0.60917,"v":0.43828,"x":60.917,"z":65.038},{"code":"E5","name":"Prosperity Gardens Tenements","desc":"A block of mixed-use apartments holding way too many people. For mysterious reasons, it is also one of the safest places to live in Little China.","cat":"lodging","u":0.60023,"v":0.44675,"x":60.023,"z":66.295}],"x":60,"z":36,"w":9,"d":8,"tier":3,"accent":"#ff3d71","threat":2,"locationCount":5,"zone":"urban","anchor":{"x":60.774,"z":67.333,"rx":3.749,"rz":3.008},"mapped":5},{"code":"F","name":"University District","region":"The Island","description":"A slim district housing the city’s only traditional institu\u0002tion of higher learning.","cityManager":"Doctor Edward Michaels (self-appointed)","securityProvider":"NCU Campus Security","gangs":["Philharmonic Vampyres","Princesses of Justice"],"locations":[{"code":"F1","name":"Biotechnica Campus","desc":"The headquarters of Biotechnica in Night City. Strange sounds can be heard from the campus at night.","cat":"corporation","u":0.39992,"v":0.46411,"x":39.992,"z":68.871},{"code":"F2","name":"Biotechnica Habitation Sphere Alpha","desc":"A geodesic dome serving as housing for Biotechnica employees.","cat":"lodging","u":0.38886,"v":0.45645,"x":38.886,"z":67.735},{"code":"F3","name":"Night City Symphony Hall","desc":"A performance space owned and operated by the Philharmonic Vampyres.","cat":"entertainment","u":0.33583,"v":0.47264,"x":33.583,"z":70.136},{"code":"F4","name":"Night City University","desc":"A college campus built up into something of a fortified monastery. The center of higher education in Night City.","cat":"landmark","u":0.30174,"v":0.4684,"x":30.174,"z":69.508},{"code":"F5","name":"Parkside Living","desc":"Apartments occupied primar\u0002ily by NCU students and some faculty. Always loud and boisterous.","cat":"lodging","u":0.42174,"v":0.47177,"x":42.174,"z":70.008},{"code":"F6","name":"Princessland!","desc":"An abandoned carnival themed around an old animated show. Now home to the Princesses of Justice.","cat":"entertainment","u":0.35356,"v":0.46666,"x":35.356,"z":69.25},{"code":"F7","name":"Stems & Seeds","desc":"A guerilla gardening operation run by Lily Larson, a former researcher for Petrochem.","cat":"other","u":0.27386,"v":0.47458,"x":27.386,"z":70.424},{"code":"F8","name":"University Cubes","desc":"Cheap rooms for university students on a budget.","cat":"landmark","u":0.27386,"v":0.461,"x":27.386,"z":68.409},{"code":"F9","name":"Yewtree","desc":"A neo-hipster bar working in collusion with NCU Security to keep students quiet while drinking in the district.","cat":"bar","u":0.34841,"v":0.47641,"x":34.841,"z":70.697}],"x":37,"z":56,"w":10,"d":9,"tier":2,"accent":"#69f0ae","threat":1,"locationCount":9,"zone":"urban","anchor":{"x":34.42,"z":69.449,"rx":7.754,"rz":1.714},"mapped":9},{"code":"G","name":"The Glen","region":"The Island","description":"The administrative center of Night City; full of movers, shakers, and power players.","cityManager":"Zohara Freeman (appointed by Night Corp)","securityProvider":"NCPD","gangs":["Dead Woods","Kill Krashers","The Reckoners","Weng Fang Tong"],"locations":[{"code":"G1","name":"1st Night City Bank","desc":"The largest bank in Night City and the most likely source of loan money for local projects (usually lent to people with plenty of money of their own).","cat":"organization","u":0.41705,"v":0.52721,"x":41.705,"z":78.235},{"code":"G2","name":"Air","desc":"An oxygen bar for those who can afford the fresh stuff.","cat":"bar","u":0.46159,"v":0.49173,"x":46.159,"z":72.97},{"code":"G3","name":"Bear’s","desc":"Famous for its microbrew selection and the moth-eaten bear head sitting above the bar.","cat":"bar","u":0.40341,"v":0.48525,"x":40.341,"z":72.008},{"code":"G4","name":"City Hall","desc":"The seat of local government in Night City.","cat":"organization","u":0.43053,"v":0.53972,"x":43.053,"z":80.091},{"code":"G5","name":"City Police Precinct #1","desc":"The first line of defense against the gangs of the combat zones … for those who can afford it.","cat":"organization","u":0.48667,"v":0.49898,"x":48.667,"z":74.045},{"code":"G6","name":"Club Atlantis","desc":"A glamorous, multi-level club with a flashy, avant-garde, and disorienting style.","cat":"bar","u":0.4772,"v":0.48882,"x":47.72,"z":72.538},{"code":"G7","name":"Glenlife Perfected","desc":"An apartment building. Looks great on the outside. Not so great on the inside.","cat":"lodging","u":0.38841,"v":0.51792,"x":38.841,"z":76.856},{"code":"G8","name":"Hall of Justice","desc":"Courthouse and jail all in one. An imposing, brutalist structure.","cat":"organization","u":0.45447,"v":0.53819,"x":45.447,"z":79.864},{"code":"G9","name":"Kasim’s","desc":"A Turkish coffee and tobacco bar. Closed on Fridays so the owner and his family can attend prayers.","cat":"bar","u":0.40902,"v":0.51802,"x":40.902,"z":76.871},{"code":"G10","name":"Merrill, Asukaga & Finch Offices","desc":"The Night City headquarters of the world’s largest inde\u0002pendent financial and investment institution. The tall skyscraper houses additional businesses.","cat":"corporation","u":0.44621,"v":0.52578,"x":44.621,"z":78.023},{"code":"G11","name":"Night City Plaza","desc":"A beautiful park open to the public. The largest green space in Night City.","cat":"landmark","u":0.40326,"v":0.50026,"x":40.326,"z":74.235},{"code":"G12","name":"Raven Microcybernetics","desc":"Night City headquarters for a major cybernetics company. The skyscraper also houses some of the company’s close business partners.","cat":"corporation","u":0.4247,"v":0.4879,"x":42.47,"z":72.402},{"code":"G13","name":"Seafoam","desc":"A cube hotel close to Club Atlantis. The party never stops here, though revelers sometimes wake up after a bender missing money, inventory, or chrome courtesy of the Reckoners.","cat":"bar","u":0.46,"v":0.47927,"x":46,"z":71.121}],"x":50,"z":52,"w":11,"d":10,"tier":3,"accent":"#ffd600","threat":2,"locationCount":13,"zone":"urban","anchor":{"x":43.558,"z":75.328,"rx":5.109,"rz":4.763},"mapped":13},{"code":"H","name":"Old Japantown","region":"The Island","description":"Most of Night City’s ethnic Japanese population has moved north, but enough still cling together here to form islands of civilization in a sea of combat zone chaos.","cityManager":"Adriane Casselle (elected by local family heads)","securityProvider":"Kimen-Gumi","gangs":["Iron Sights","Maelstrom","Red Chrome Legion","The Shroomers","Tyger Claws"],"locations":[{"code":"H1","name":"Crisis Medical Center","desc":"A no-questions asked medical center supplied with surprisingly advanced technology. Multiple Corps use itasa staging ground to run medical experiments.","cat":"ripperdoc","u":0.53068,"v":0.49898,"x":53.068,"z":74.045},{"code":"H2","name":"Highcourt Plaza Hotel","desc":"A classy and well-de\u0002fended hotel providing excellent service. Most guests arrive via AV to avoid driving through a combat zone.","cat":"landmark","u":0.53697,"v":0.46983,"x":53.697,"z":69.72},{"code":"H3","name":"Honest Hiro’s Used Cars","desc":"A used car deal\u0002ership supplied by the Steel Vaqueros (and other nomads) and protected by edgerunners who trade service for vehicles.","cat":"shop","u":0.54583,"v":0.49387,"x":54.583,"z":73.288},{"code":"H4","name":"Mrs. Suzuki’s Bodega","desc":"The most secure and stable market in Old Japantown. Known for being the only distribution point for mushrooms grown by the Shroomers.","cat":"food","u":0.54583,"v":0.48366,"x":54.583,"z":71.773},{"code":"H5","name":"The Precipice","desc":"A cargo container community. Many of the residents earn extra cash by volunteering for experiments at Crisis Medical.","cat":"ripperdoc","u":0.51932,"v":0.4659,"x":51.932,"z":69.136},{"code":"H6","name":"Unnamed Cube Hotel","desc":"The rooms are cleaned out by ceiling-mounted water jets, and the locks on the doors are dodgy, but at least there are no cameras and no questions.","cat":"lodging","u":0.5572,"v":0.49469,"x":55.72,"z":73.409}],"x":61,"z":47,"w":10,"d":9,"tier":3,"accent":"#ff6ec7","threat":3,"locationCount":6,"zone":"urban","anchor":{"x":53.93,"z":71.895,"rx":1.998,"rz":2.759},"mapped":6},{"code":"I","name":"South Night City","region":"The Island","description":"A sprawling mix of industry and residential buildings. Itisa combat zone primarily because the city manager, Gaven Haakensen, cares more about lining his pockets than he does doing his job. That doesn’t make him unusual, but he’s more blatant about it than most.","cityManager":"Gar ven Haakensen (self-appointed)","securityProvider":"Scythe Security","gangs":["Bozos","Dead Woods","The Enhanced","Kanzaki Family","Kill Krashers","The Reckoners","The Sinful Adams","Tyger Claws","The Zoners"],"locations":[{"code":"I1","name":"The Boneyard","desc":"Formerly the Night City Garden of Rest. Now a shanty town and home to the Sinful Adams. They run an annual festival on Halloween for the district’s residents.","cat":"landmark","u":0.37568,"v":0.48586,"x":37.568,"z":72.099},{"code":"I2","name":"Mind Nutz Lover","desc":"The hottest braindance club in South Night City.","cat":"bar","u":0.36,"v":0.48331,"x":36,"z":71.72},{"code":"I3","name":"Savage Docs","desc":"A multi-ripperdoc operation of good reputation protected by both the Yakuza and the Tyger Claws (despite their differences).","cat":"ripperdoc","u":0.37144,"v":0.50255,"x":37.144,"z":74.576},{"code":"I4","name":"Silverhand Studios","desc":"Apartments and studio space rented out to artists and musicians. Run by the cousin of legendary Rockerboy Kerry Eurodyne.","cat":"entertainment","u":0.39394,"v":0.57096,"x":39.394,"z":84.727},{"code":"I5","name":"The Slammer","desc":"A ganger bar. Home of the Arena, a no-holds-barred combat ring gangers can step into to settle their disputes without murder.","cat":"bar","u":0.35886,"v":0.58378,"x":35.886,"z":86.629},{"code":"I6","name":"South Cargo Village","desc":"A cargo container com\u0002munity. Despite being on the border of The Glen, it is still in a combat zone, and the cops treat it as such.","cat":"neighborhood","u":0.43992,"v":0.55988,"x":43.992,"z":83.083},{"code":"I7","name":"Union Chapel Building","desc":"Once an architectural landmark. Now abandoned, in theory. Some think the Reckoners use the basement as a refuge.","cat":"landmark","u":0.34598,"v":0.49183,"x":34.598,"z":72.985},{"code":"I8","name":"University Cargo Bay","desc":"Cargo container housing for university students.","cat":"landmark","u":0.30045,"v":0.4901,"x":30.045,"z":72.727}],"x":49,"z":63,"w":13,"d":10,"tier":2,"accent":"#ff9100","threat":4,"locationCount":8,"zone":"combat","anchor":{"x":36.828,"z":77.318,"rx":7.164,"rz":9.311},"mapped":8},{"code":"J","name":"Port of Night City","region":"The Island","description":"A central location for cargo entering and leaving Night City by sea. Run by nomads from the Thelas Nation.","cityManager":"Calypso (appointed by Thelas elders)","securityProvider":"Thelas Marines","gangs":["Consortium","Dead Woods"],"locations":[{"code":"J1","name":"Dock 13","desc":"The storefront (and occasional night market) of marketing genius Willy “Mister Amaaaze” Maze.","cat":"shop","u":0.29894,"v":0.55611,"x":29.894,"z":82.523},{"code":"J2","name":"Dock 14 Studio Apartments","desc":"An apartment building just one dock away from the always loud Dock 13.","cat":"lodging","u":0.30432,"v":0.56244,"x":30.432,"z":83.462},{"code":"J3","name":"Dock Cargo Community","desc":"A cargo container community nestled between the docks.","cat":"neighborhood","u":0.30432,"v":0.56841,"x":30.432,"z":84.349},{"code":"J4","name":"Flotsam","desc":"A small drift town just off the coast. It consists of several larger vessels run aground con\u0002nected by smaller boats, rafts, and walkways. The Randy Dandy, a mobile bar, often docks here.","cat":"bar","u":0.25758,"v":0.51307,"x":25.758,"z":76.136},{"code":"J5","name":"Medical Technologies","desc":"A body bank special\u0002izing in growing replacement limbs. Known for buying and selling dodgy cyberware as well.","cat":"ripperdoc","u":0.29545,"v":0.51904,"x":29.545,"z":77.023},{"code":"J6","name":"Rusty’s Dive Shack","desc":"A rough-and-tumble bar for sea-faring types. Built out of the bridge of an old container sub.","cat":"bar","u":0.30682,"v":0.53523,"x":30.682,"z":79.424},{"code":"J7","name":"South Night City Reclaimed Studio","desc":"An apart\u0002ment building near the water. Leaving the building risks encountering gangers visiting Medical Technologies.","cat":"ripperdoc","u":0.29038,"v":0.52502,"x":29.038,"z":77.909}],"x":33,"z":68,"w":12,"d":8,"tier":1,"accent":"#8d99ae","threat":1,"locationCount":7,"zone":"urban","anchor":{"x":29.397,"z":80.118,"rx":3.639,"rz":4.231},"mapped":7},{"code":"K","name":"Reclamation Zone","region":"The Island","description":"A small enclave run by nomads turned reclaimers. They’ve taken over the operation of Night City’s public transportation, exchanging their technical and motor skills for the land.","cityManager":"Santos Dorado (elected by district residents)","securityProvider":"Los Perros Guardianes","gangs":["Tombstone Preservers"],"locations":[{"code":"K1","name":"Herschel’s Crematorium","desc":"A funeral home run by an undertaker who truly believes everyone deserves a dignified sendoff into the next life.","cat":"landmark","u":0.37371,"v":0.55478,"x":37.371,"z":82.326}],"x":62,"z":66,"w":9,"d":8,"tier":1,"accent":"#6d8b74","threat":1,"locationCount":1,"zone":"rebuilding","anchor":{"x":37.371,"z":82.326,"rx":1.5,"rz":1.5},"mapped":1},{"code":"L","name":"Old Combat Zone","region":"The Island","description":"In the late 2010s and early 2020s, Night City began expanding the Island by filling in land to the southeast. In the aftermath of the 4th Corporate War, what was intended tobea shining beacon of industrial might devolved into the worst combat zone Night City had ever seen. Slowly, inch by inch, groups of edgerunners have strived to rebuild it.","cityManager":"Brick Coleman (as leader of Edgerunners Inc)","securityProvider":"Edgerunners Inc","gangs":["Edgerunners Inc","The Faded","Generation Red","Iron Sights","The Shroomers"],"locations":[{"code":"L1","name":"From the Ashes","desc":"A sliding scale clinic run by Phoenix Redwyne.","cat":"ripperdoc","u":0.51303,"v":0.51429,"x":51.303,"z":76.318},{"code":"L2","name":"Jesse James’ Kosher Deli","desc":"More of a saloon than a deli, though for a small fortune you can get a pretty good corned beef on rye.","cat":"bar","u":0.48909,"v":0.56448,"x":48.909,"z":83.765},{"code":"L3","name":"NC Ionic Semiconductor Building","desc":"A fac\u0002tory-turned-cargo community. Many Iron Sights stash family members here for safety.","cat":"corporation","u":0.54833,"v":0.52277,"x":54.833,"z":77.576},{"code":"L4","name":"The Underground","desc":"The home of the Shroomers, located deep beneath the streets of Night City. The land to the north of the island. Once home to forest and parks, now home to megabuildings, the masses, and the military.","cat":"other","u":0.53197,"v":0.51429,"x":53.197,"z":76.318}],"x":60,"z":57,"w":9,"d":8,"tier":2,"accent":"#ff1744","threat":4,"locationCount":4,"zone":"combat","anchor":{"x":52.06,"z":78.494,"rx":3.151,"rz":5.271},"mapped":4},{"code":"M","name":"NorCal Military Base","region":"Northside","description":"Home of the Estero Bay Military COG (a mixture of various military units into a single organized group). In theory, the COG is loyal to Nor Cal and the Pacifica Confederation, but they’ve also made a deal with Militech, trading land and access for training and munitions.","cityManager":"General Ash Giovanni (base commander)","securityProvider":"Nor Cal Military Police","gangs":["Culper Ring"],"locations":[{"code":"M1","name":"Militech Corporate Operatives Housing","desc":"Secure housing for Militech employees.","cat":"corporation","u":0.44318,"v":0.23234,"x":44.318,"z":34.477},{"code":"M2","name":"Militech Offices","desc":"Night City headquarters for Militech, a one-stop shop for all your military and security needs.","cat":"shop","u":0.39273,"v":0.23918,"x":39.273,"z":35.492}],"x":30,"z":12,"w":12,"d":9,"tier":1,"accent":"#9aa5b1","threat":1,"locationCount":2,"zone":"urban","anchor":{"x":41.796,"z":34.984,"rx":2.523,"rz":1.5},"mapped":2},{"code":"N","name":"Watson Development","region":"Northside","description":"A developing district built up by the Night City Co-Prosperity Sphere (NCCS), an alliance of various Corporations (pri\u0002marily of Japanese origin). Last year, community organizer Lucius Rhyne led a district-wide labor strike, forcing the NCCS to organize a general election for City Manager. Rhyne won the resulting race handily.","cityManager":"Lucius Rhyne (elected via general election)","securityProvider":"NCPD","gangs":["Arzin Tynon","Dragula Racers","G3","Kanzaki Family","Tyger Claws","Wild Things"],"locations":[{"code":"N1","name":"City Police Precinct #3","desc":"A large, well-armed police precinct. The egos of some cops here took a bruis\u0002ing when they were unable to break up the labor strike.","cat":"organization","u":0.39265,"v":0.29023,"x":39.265,"z":43.068},{"code":"N2","name":"HTown","desc":"A tent city built outside the walls of a gated community. Tensions are high.","cat":"neighborhood","u":0.46341,"v":0.15494,"x":46.341,"z":22.992},{"code":"N3","name":"Petrochem & Sov Oil Joint Temporary","desc":"Housing Solution: In a twist of irony, both Petrochem and Sov Oil provide employee housing in the same building. No one is happy about it.","cat":"lodging","u":0.49568,"v":0.23744,"x":49.568,"z":35.235},{"code":"N4","name":"Petrochem Offices","desc":"The heavily defended headquarters of Petrochem in Night City. There’s a small museum dedicated to the history of petroleum. Across the street from the Sov Oil Offices.","cat":"corporation","u":0.50462,"v":0.24765,"x":50.462,"z":36.75},{"code":"N5","name":"Red Oktober","desc":"A Soviet-themed bar built into an old subway station.","cat":"bar","u":0.44265,"v":0.32423,"x":44.265,"z":48.114},{"code":"N6","name":"Redline","desc":"Home of the most thrilling bloodsport in Night City and the Wild Things, a gang dedicated to organized competitive violence.","cat":"other","u":0.46644,"v":0.33903,"x":46.644,"z":50.311},{"code":"N7","name":"Sakura’s","desc":"A Night City interpretation of an izakaya, an informal bar.","cat":"bar","u":0.47902,"v":0.29564,"x":47.902,"z":43.871},{"code":"N8","name":"Smash/Cut","desc":"An EDM club where the chromed upgoto dance, do drugs, and have anonymous sex.","cat":"bar","u":0.49553,"v":0.2208,"x":49.553,"z":32.765},{"code":"N9","name":"Sov Oil Offices","desc":"Night City headquarters for Sov Oil. Completely off-limits to the public. Across the street from the Petrochem Offices.","cat":"corporation","u":0.49174,"v":0.24888,"x":49.174,"z":36.932},{"code":"N10","name":"Trauma Team Corporate Living Center","desc":"Housing for Trauma Team employees.","cat":"ripperdoc","u":0.45871,"v":0.27047,"x":45.871,"z":40.136},{"code":"N11","name":"Trauma Team Tower","desc":"Night City headquar\u0002ters for Trauma Team. Includes an AV repair bay and a hospital for the exclusive use of Executive-level clients.","cat":"ripperdoc","u":0.47136,"v":0.25684,"x":47.136,"z":38.114},{"code":"N12","name":"Vargtimmen","desc":"A neo-pagan mead bar. Famous for their solstice and equinox parties.","cat":"bar","u":0.3653,"v":0.25516,"x":36.53,"z":37.864},{"code":"N13","name":"Watson Central Cubelife","desc":"A bog standard cube hotel. Let’s all all welcome Maanaager Luccius RRhyyne to the Counccill. II’mm sure we all all llook forwaardd to working working with himm. WWith thaat out of the wayay, llet’s bbegin the vote on Maanaager Lee’s bbillll to aauthorizze the use of lethal forcce when ddealaling with lab labor strikes strikes. — FFromm the NNight Cityy Counccill RReccordds","cat":"lodging","u":0.45348,"v":0.26343,"x":45.348,"z":39.091}],"x":47,"z":15,"w":14,"d":11,"tier":3,"accent":"#00b8d4","threat":3,"locationCount":13,"zone":"rebuilding","anchor":{"x":46.005,"z":38.865,"rx":9.475,"rz":15.873},"mapped":13},{"code":"O","name":"Kabuki","region":"Northside","description":"A small district centered around the Nakagawa Kabuki Theater. Common wisdom holds that while Watson acts as the arms and legs of the Night City Co-Prosperity Sphere, Kabuki is its brain and heart.","cityManager":"Yoshiki Murakami (appointed by the NCCS)","securityProvider":"Kimen-Gumi","gangs":["G3","Tyger Claws"],"locations":[{"code":"O1","name":"Nakagawa Kabuki Theater","desc":"The most magnificent building in Northside. Home to a Kabuki troupe said to be the equal of any in Japan, as well as a museum and the central offices of the Tyger Claws leadership.","cat":"corporation","u":0.49424,"v":0.31948,"x":49.424,"z":47.409},{"code":"O2","name":"Yum Seng","desc":"A host and hostess bar famous for its seafood and soundproof karaoke boxes. The overpacked suburbs, struggling to rebuild in the Time of the Red.","cat":"bar","u":0.4947,"v":0.28369,"x":49.47,"z":42.099}],"x":62,"z":18,"w":10,"d":9,"tier":3,"accent":"#ff4081","threat":1,"locationCount":2,"zone":"urban","anchor":{"x":49.447,"z":44.754,"rx":1.5,"rz":2.655},"mapped":2},{"code":"P","name":"New Westbrook","region":"Mainland","description":"An urban sprawl built in the remains of an upscale suburb. It mixes glitz and glam with tent cities and low\u0002rent housing. Most of the northern part of the district is occupied by a walled-off fake city where Network 54 runs and films The Combat Zone, a battle royale “game show” in which fifty people enter and only one gets to leave alive with a year’s worth of real chicken dinners as the prize.","cityManager":"Belkis Abera (appointed by World Sat and Network 54)","securityProvider":"NCPD","gangs":["Arzin Tynon","Prime-Time Players","Street Queens","Tombstone Preservers"],"locations":[{"code":"P1","name":"Canalside Plaza","desc":"A strip mall. Home to the Sizzle Jams Talent Agency, a Rickshaws, a Capitán Caliente restaurant, the Mane Event hair and nail salon, and an Oasis.","cat":"food","u":0.7147,"v":0.45359,"x":71.47,"z":67.311},{"code":"P2","name":"Chatelaine’s","desc":"An early 20th-century style cabaret and burlesque queer club so popular it attracts a number of straight tourists.","cat":"bar","u":0.64606,"v":0.32168,"x":64.606,"z":47.735},{"code":"P3","name":"Dilly’s","desc":"A love hotel with a unique mascot – a cartoon pickle wearing a rolled-up condom as a beanie.","cat":"lodging","u":0.62212,"v":0.28768,"x":62.212,"z":42.689},{"code":"P4","name":"Evergreen Apartments","desc":"A former big box store transformed into a cube hotel. For the right price, the landlord is more than happy to evict existing tenants for you.","cat":"shop","u":0.59682,"v":0.30636,"x":59.682,"z":45.462},{"code":"P5","name":"Network 54 Offices","desc":"The Night City head\u0002quarters and broadcasting tower for Network 54.","cat":"corporation","u":0.64818,"v":0.30126,"x":64.818,"z":44.705},{"code":"P6","name":"Network 54 Westbrook Private Acres","desc":"A gated community of duplexes for the use of Network 54 employees.","cat":"corporation","u":0.66939,"v":0.31402,"x":66.939,"z":46.599},{"code":"P7","name":"Night City Firestation #1","desc":"A well-supplied firestation. It specializes in AV-based firefighting.","cat":"organization","u":0.71242,"v":0.43828,"x":71.242,"z":65.038},{"code":"P8","name":"North Cargo Village","desc":"A cargo container com\u0002munity stacked in an abandoned parking lot.","cat":"neighborhood","u":0.56091,"v":0.29278,"x":56.091,"z":43.447},{"code":"P9","name":"Rocklin Augmentics Campus","desc":"Night City headquarters of Rocklin Augmentics, including offices, meeting spaces, and a research hospital.","cat":"ripperdoc","u":0.68333,"v":0.43654,"x":68.333,"z":64.78},{"code":"P10","name":"Rocklin Augmentics Innovation Hub","desc":"Corporate housing for Rocklin Augmentics employees. They are encouraged to use the various maker spaces built inside.","cat":"corporation","u":0.70098,"v":0.44507,"x":70.098,"z":66.045},{"code":"P11","name":"World Sat Offices","desc":"A heavily defended com\u0002pound on the edge of the city. It is not only the local headquarters of World Sat but also the junction point for satellite communications between Night City and the outside world.","cat":"corporation","u":0.64924,"v":0.24428,"x":64.924,"z":36.25}],"x":79,"z":30,"w":12,"d":11,"tier":3,"accent":"#b388ff","threat":2,"locationCount":11,"zone":"suburbs","anchor":{"x":65.492,"z":51.824,"rx":9.401,"rz":15.574},"mapped":11},{"code":"Q","name":"Charter Hill","region":"Mainland","description":"A small but influential community. On a clear day, the residents of Charter Hill can see the walls of the Exec Zone and dream of climbing even higher on the Corporate ladder.","cityManager":"Symon Featherstonehaugh (elected by property owners)","securityProvider":"Militech","gangs":["Prime-Time Players","Tombstone Preservers","Tyger Claws"],"locations":[{"code":"Q1","name":"Anjelika’s","desc":"A host and hostess bar catering to clients with a heavy cyberware fetish.","cat":"bar","u":0.68697,"v":0.36681,"x":68.697,"z":54.432},{"code":"Q2","name":"Bella Mia","desc":"A club where the affluent and most fashionable residents of Night City gotobe seen.","cat":"bar","u":0.69144,"v":0.35619,"x":69.144,"z":52.856},{"code":"Q3","name":"L’Ermitage","desc":"A high-end apartment complex. Most of the units are rented on a short-term basis by Execs visiting Night City for a prolonged period of time.","cat":"lodging","u":0.69545,"v":0.38774,"x":69.545,"z":57.538},{"code":"Q4","name":"Seral Grove","desc":"An art installation turned high-end burial ground located beneath the district. Burial packages include digital reconstructions of the deceased so visitors can “speak” to their loved ones.","cat":"other","u":0.73652,"v":0.3132,"x":73.652,"z":46.477}],"x":82,"z":44,"w":11,"d":9,"tier":4,"accent":"#ffd600","threat":2,"locationCount":4,"zone":"executive","anchor":{"x":70.26,"z":52.826,"rx":3.392,"rz":6.349},"mapped":4},{"code":"R","name":"Exec Zone","region":"Mainland","description":"The single most secure district in Night City. Only the truly elite live here.","cityManager":"Doctor Karen Davies (elected by Home Owner’s Association)","securityProvider":"Lazarus","gangs":[],"locations":[],"x":90,"z":55,"w":9,"d":8,"tier":5,"accent":"#ffffff","threat":0,"locationCount":0,"zone":"executive","anchor":null,"mapped":0},{"code":"S","name":"Heywood Docks","region":"Mainland","description":"As the world returns to normal, Corporations are looking to cut the nomad nations out of the shipping and logistics equation. Larger vessels can’t use the Heywood Docks, but smaller, Corporate-sponsored ships moving up and down the West Coast can.","cityManager":"Andrea Lee (appointed by SK Security)","securityProvider":"SK Security","gangs":["Dead Woods","Skiv Family"],"locations":[{"code":"S1","name":"Greenbox Storage Units","desc":"Technically a secure storage facility, but customers have been known to live inside the units.","cat":"other","u":0.6553,"v":0.52696,"x":65.53,"z":78.197}],"x":68,"z":74,"w":10,"d":7,"tier":1,"accent":"#8d99ae","threat":1,"locationCount":1,"zone":"suburbs","anchor":{"x":65.53,"z":78.197,"rx":1.5,"rz":1.5},"mapped":1},{"code":"T","name":"North Heywood","region":"Mainland","description":"Over the past decade, Heywood has been divided into two districts. In the north are workaday residents, many of whom have found jobs in the nearby Heywood Industrial Zone.","cityManager":"Barry “Big Deal” Delvecchio (appointed by district council)","securityProvider":"6th Street","gangs":["6th Street","Inquisitors","The Muses","The Toecutters"],"locations":[{"code":"T1","name":"Acorn Towers","desc":"A dual-tower apartment complex housing Dynalar employees.","cat":"landmark","u":0.76197,"v":0.48004,"x":76.197,"z":71.235},{"code":"T2","name":"The Armory","desc":"A former National Guard armory transformed into the headquarters of 6th Street.","cat":"corporation","u":0.69129,"v":0.53375,"x":69.129,"z":79.205},{"code":"T3","name":"Biotechnica Palm Grove","desc":"A grove of experimental palm trees owned and monitored by Biotechnica.","cat":"other","u":0.75227,"v":0.4707,"x":75.227,"z":69.849},{"code":"T4","name":"Converted Motel Studio Apartments","desc":"A no-name motel transformed into no-name apartments on the edge of the city.","cat":"lodging","u":0.8428,"v":0.51526,"x":84.28,"z":76.462},{"code":"T5","name":"Dynalar Campus","desc":"The regional headquarters of Dynalar, a popular cyberware and electronics company.","cat":"corporation","u":0.73333,"v":0.4759,"x":73.333,"z":70.621},{"code":"T6","name":"Forlorn Hope","desc":"The home of The Forlorn Hope, a venerable edgerunner bar and Night City institu\u0002tion (after the events of Tales of the RED: Hope Reborn).","cat":"bar","u":0.73333,"v":0.46641,"x":73.333,"z":69.212},{"code":"T7","name":"Nana Meow’s Nursery","desc":"Not a guerilla garden itself but a shop that supplies gear and seeds to guerilla gardeners.","cat":"shop","u":0.71318,"v":0.51174,"x":71.318,"z":75.939},{"code":"T8","name":"Night City Animal Shelter","desc":"A former veteri\u0002narian clinic now occupied by a ripperdoc. It special\u0002izes in Exotics and Bioexotics.","cat":"ripperdoc","u":0.76621,"v":0.5049,"x":76.621,"z":74.924},{"code":"T9","name":"Woodland Park","desc":"A small neighborhood near the Dynalar campus. Highlights include the Burning Bright Bodega, Breeze (a mom and pop drug store), the Palms cargo container community, the Shark apartment building, and the Zolletta cube hotel.","cat":"food","u":0.74091,"v":0.46896,"x":74.091,"z":69.591},{"code":"T10","name":"Xanadu","desc":"A roller derby rink and disco tech. Home of the Muses.","cat":"other","u":0.75053,"v":0.47938,"x":75.053,"z":71.136}],"x":76,"z":62,"w":11,"d":9,"tier":2,"accent":"#ff9100","threat":2,"locationCount":10,"zone":"suburbs","anchor":{"x":74.858,"z":72.817,"rx":9.422,"rz":6.388},"mapped":10},{"code":"U","name":"Heywood Industrial Zone","region":"Mainland","description":"The largest industrial zone in Night City, overflowing with warehouses, construction equipment, factories, and even some derelict cargo ships.","cityManager":"Theo Walker (appointed by the Arroyo Concern)","securityProvider":"NCPD","gangs":["Consortium","Dead Woods","The Enhanced","Fixie’s Couriers"],"locations":[{"code":"U1","name":"D.V. Rambling Rose","desc":"An ancient vessel stuck in dry dock. Home base for Fixie’s Couriers.","cat":"other","u":0.5978,"v":0.59557,"x":59.78,"z":88.379},{"code":"U2","name":"Old Ironworks Building","desc":"The inside has been converted into apartments, and the landlords have stacked cargo container housing on the roof.","cat":"lodging","u":0.61326,"v":0.59873,"x":61.326,"z":88.849},{"code":"U3","name":"Yang’s Wheels","desc":"The headquarters, manu\u0002facturing factory, and warehouse of Yang’s Wheels, Night City’s biggest provider of inexpensive wheeled transportation.","cat":"corporation","u":0.64144,"v":0.55927,"x":64.144,"z":82.992},{"code":"U4","name":"Zhirafa Office Park","desc":"The Night City head\u0002quarters of Zhirafa. Drones are used for both labor and security.","cat":"landmark","u":0.62379,"v":0.54396,"x":62.379,"z":80.72},{"code":"U5","name":"Zhirafa Office Park Micro Village","desc":"Corporate housing for Zhirafa employees, colorfully disguised as cargo containers.","cat":"corporation","u":0.6528,"v":0.55417,"x":65.28,"z":82.235}],"x":84,"z":71,"w":11,"d":9,"tier":1,"accent":"#a1887f","threat":2,"locationCount":5,"zone":"suburbs","anchor":{"x":62.582,"z":84.635,"rx":2.802,"rz":4.214},"mapped":5},{"code":"V","name":"Santo Domingo","region":"Mainland","description":"South Heywood is better known by the locals as Santo Domino. The nomad camp near the dam heavily influ\u0002ences the district, but the Aldecaldos power may be waning. Theresa Valentino, an independent candidate, recently won the election for City Manager thanks to backing from the El Norte cartel.","cityManager":"Theresa Valentino (elected by residents)","securityProvider":"Aldecaldo Peacekeepers","gangs":["El Norte Cartel","Kill Krashers","Rat Kings","Steel Vaqueros"],"locations":[{"code":"V1","name":"Aldecaldo Camp","desc":"A large multi-cultural encampment sitting at the base of the Petrochem dam. While all nomads are welcome, the camp is primarily dominated by the Aldecaldos.","cat":"other","u":0.76894,"v":0.65203,"x":76.894,"z":96.758},{"code":"V2","name":"City Police Precinct #2","desc":"Large but over\u0002worked, the cops here rely heavily on drones to patrol their beats.","cat":"organization","u":0.56939,"v":0.64182,"x":56.939,"z":95.242},{"code":"V3","name":"East Cargo Village","desc":"A dusty cargo container community located near the edge of the city.","cat":"neighborhood","u":0.70576,"v":0.64606,"x":70.576,"z":95.871},{"code":"V4","name":"Heywood Suites","desc":"An apartment complex situated beneath one of the most heavily trafficked overpasses in Night City. Many residents have lev\u0002el-dampening cyberware installed.","cat":"lodging","u":0.66288,"v":0.61543,"x":66.288,"z":91.326},{"code":"V5","name":"María’s","desc":"A family-owned beer tent located just inside the city limits.","cat":"other","u":0.67045,"v":0.68777,"x":67.045,"z":102.061},{"code":"V6","name":"Metal Storm","desc":"A seemingly indestructible bar located under the Pacifica Bridge. Popular with FBCs.","cat":"bar","u":0.44364,"v":0.62064,"x":44.364,"z":92.099},{"code":"V7","name":"Woodchipper’s Garage","desc":"The home base of Woodchipper, the most influential nomad Fixer in Night City. She throws her famous Night Markets/ block parties in the cul-de-sac to the southwest. One part vacation spot, one part urban wasteland.","cat":"shop","u":0.69697,"v":0.58822,"x":69.697,"z":87.288}],"x":88,"z":83,"w":12,"d":10,"tier":2,"accent":"#ff7043","threat":2,"locationCount":7,"zone":"suburbs","anchor":{"x":64.543,"z":94.378,"rx":20.179,"rz":7.683},"mapped":7},{"code":"W","name":"Pacifica Playground","region":"Southside","description":"A district built around Playland by the Sea.","cityManager":"Elliot Kane (appointed by Playland by the Sea management)","securityProvider":"Militech","gangs":["6th Street","The Andersons","The Enhanced","Mudang Gumi","Piranhas","Voodoo Boys"],"locations":[{"code":"W1","name":"Bits’n’Bolts","desc":"A hole-in-the-wall tech shop with connections to weaponsmith and inventor Faisal.","cat":"shop","u":0.41061,"v":0.6357,"x":41.061,"z":94.333},{"code":"W2","name":"Cubeland by the Sea","desc":"A shoddy cube hotel a stone’s throw away from Playland by the Sea.","cat":"lodging","u":0.35258,"v":0.62635,"x":35.258,"z":92.947},{"code":"W3","name":"Mister Rice Guy","desc":"An upscale sushi restaurant. Famous for its mascot, Hime Cat.","cat":"food","u":0.30962,"v":0.6893,"x":30.962,"z":102.288},{"code":"W4","name":"Playhouse","desc":"An apartment complex with a shady past. Rumors suggest it is haunted.","cat":"lodging","u":0.37152,"v":0.64846,"x":37.152,"z":96.227},{"code":"W5","name":"Playland by the Sea","desc":"Night City’s premiere tourist destination. An amusement park sponsored by various Corporations. The Piranahs hold sway here, and it is home to a surprising number of yogangs (often used by the park as free labor).","cat":"corporation","u":0.24523,"v":0.65954,"x":24.523,"z":97.871},{"code":"W6","name":"Pleasant Valley Apartments","desc":"An apartment building designed for neo-luddites who want to escape from technoshock overload.","cat":"lodging","u":0.32098,"v":0.68675,"x":32.098,"z":101.909},{"code":"W7","name":"Scenic Cubes","desc":"A cube hotel covered in some of the most expressive graffiti in Night City.","cat":"lodging","u":0.28432,"v":0.64871,"x":28.432,"z":96.265},{"code":"W8","name":"The XX (The Twenty)","desc":"A dive punk bar. Breakfist, the owner, serves juice instead of booze.","cat":"bar","u":0.41697,"v":0.64422,"x":41.697,"z":95.599}],"x":36,"z":84,"w":13,"d":11,"tier":2,"accent":"#7c4dff","threat":3,"locationCount":8,"zone":"suburbs","anchor":{"x":33.898,"z":97.18,"rx":9.375,"rz":5.108},"mapped":8},{"code":"X","name":"Rancho Coronado","region":"Southside","description":"Technically part of Night City, no one has yet bothered to pony up the cash to buy Rancho Coronado’s seat on the City Council. As a result, the district lacks in just about every resource, from utilities to fire and police services.","cityManager":"None","securityProvider":"NCPD (in theory)","gangs":["6th Street","Albino Alligators","Dirty Hippies","Steel Vaqueros","Voodoo Boys"],"locations":[{"code":"X1","name":"Albino Alligator Carwash","desc":"Home base for the Albino Alligators. Also one of the most reliable places to find clean drinking water in the district.","cat":"bar","u":0.40053,"v":0.7208,"x":40.053,"z":106.962},{"code":"X2","name":"Coronado Heights","desc":"An apartment building so close to Pacifica that it might as well be part of it.","cat":"lodging","u":0.39833,"v":0.67807,"x":39.833,"z":100.621},{"code":"X3","name":"Eagle Rock Stadium","desc":"A former football field transformed into a cargo container community.","cat":"entertainment","u":0.49773,"v":0.64167,"x":49.773,"z":95.22},{"code":"X4","name":"Jack ‘N’ the Green","desc":"A guerilla gardening outfit run by reclaimers.","cat":"other","u":0.55712,"v":0.66035,"x":55.712,"z":97.992},{"code":"X5","name":"Minimallism","desc":"Once a mall catering to eager beaverville consumers, now an empty husk claimed on one side by reclaimers and on the other by a consor\u0002tium of Fixers who take turns running Night Markets there. Also known as the RC Night Market by residents. Night City Gangs nightcitygangs A brief guide to Night City’s gangs and criminal orga\u0002nizations. This list is likely incomplete since old gangs die and new gangs rise up all the time. 6th Street: Formed by veterans of the 4th Corporate War, 6th Street tries to earn money through security contracts but has been forced to move into extortion and smuggling to pay the bills. Albino Alligators: A party gang with a surprisingly sig\u0002nificant influence on Rancho Coronado. Famous for their white alligator cartoon mascot and popped shirt collars. The Andersons: An aging yogang with a family theme. In danger of being swallowed up by the Piranhas. Arzin Tynon: An older boostergang operating on the northern edges of Night City. The Bozos: A prankster gang (for a certain deadly definition of prankster) with a clown theme. Currently engaged in a civil war of pranks and mayhem. Consortium: A tightly organized Russian mob group with ties to the Thelas nomad nation. Culper Ring: A secret sect within the Estero Bay Military COG dedicated to reuniting Nor Cal with the US. Dead Woods: A cowboy-themed gang. They act as self-appointed protectors of Night City’s railways. The Dirty Hippies: A group of guerilla gardeners who specialize in the growing and sale of herbs laced with various drugs, collectively known as ganga. Dragula Racers: A monster-themed racing gogang. Eastern Tigers Triad: An organized crime ring recently arrived from China. Edgerunners Inc: A group of younger edgerunners seeking to reconnect the Old Combat Zone to Night City. Named after a pre-war company. El Norte Cartel: A Mexican criminal organization establishing itself in Night City. Said to be connected to Theresa Valentino, the Santo Domingo City Manager. The Enhanced: A cult that believes cyberpsychosis represents the next stage of human evolution. Eurotrashers: A party gang in Little Europe. All members speak with a “European” accent no one can identify. The Faded: A group of older edgerunners who want to keep Night City from interfering with the Old Combat Zone. Fixie’s Couriers: A collective of bicycle messengers and couriers guided (not led) by a Fixer known as Fixie. G3: A disturbingly violent anime-themed poser gang. Generation Red: A yogang operating out of the Old Combat Zone. Gold Dragons: A gang under the control of David Ling Po, providing protection in Little China. Inquisitors: A cult centered on the belief that cyber\u0002ware is evil and ripping it out of others saves their souls. Iron Sights: A brutal combat gang. Their new sponsor, a Fixer named Hornet, has built them into a force to be reckoned with. Kanzaki Family: The only surviving faction of Yakuza left in Night City. At odds with the Tyger Claws. Kill Krashers: A relatively new gang glorifying vio\u0002lence above all else. Growing with surprising speed. Lightning Cats: A Bioexotic cat gang operating out of the Hot Zone. Maelstrom: A combat gang with a might makes right philosophy. Their leader, Warlock, has transformed Maelstom into a surprisingly effective criminal enterprise. Mudang Gumi: A gang of Netrunners and burglars focused on data theft. The Muses: A poser gang and roller derby squad with a fusion disco/Greek mythology theme. Philharmonic Vampyres: A gang with a split per\u0002sonality, trying to decide if it should lean into its artistic goth side or stick to its prankster roots. Piranhas: Night City’s premiere party gang. These days they don’t just attend the best parties. They throw them. Princesses of Justice: A poser gang based on an old animated show. Offers protection to those victims of abuse. Rat Kings: A small boostergang operating out of the still-under-construction H4 Megabuilding. Reckoners: A nihilistic cult preaching about an upcoming Harvest of Souls. Always looking for dona\u0002tions, often from someone’s unconscious body. Red Chrome Legion: A neo-nazi hate group locked in a war of attrition with the Iron Sights. Scavvers: Not a single gang but a group of them, all sur\u0002viving by scavenging tech from ruins and combat zones. The Sinful Adams: A goth poser gang living in the South Night City boneyard. Skiv Family: Night City’s dominant mafia family. They control the Heywood Docks. Steel Vaqueros: A nomad pack operating up and down the west coast. They recruit locals to act as junior members of the pack and “hold down the fort” while they are on the road. The Prime-Time Players: A poser gang, usually inspired by old sitcoms and television shows. Broken up into a number of different factions based on theme. The Shroomers: Part survivalist group, part guerilla gardener collective. The Shroomers live beneath the streets of the Old Combat Zone, where they grow various fungi. The Street Queens: A guardian gang dedicated to protecting the queer residents and neighborhoods of Night City. The Toecutters: A Raffen Shiv clan operating on the eastern edges of Night City. Said by some to be cannibals. Tombstone Preservers: A guardian gang dedi\u0002cated to protecting the sanctity of the dead. Tyger Claws: A former Araska proxy gang, the Tyger Claws are now a dominant force in Kabuki and Old Japantown where they control both security and the criminal element. Undertow: A gang operating in Little Europe and Downtown. They claim to be fighting against gentrifi\u0002cation, but their violence often harms the very neigh\u0002borhoods they’re trying to protect. Voodoo Boys: Posers who drape themselves in Hollywood-style “voodoo” trappings. Violent and focused primarily on the drug trade. Weng Fang Tong: A major crime syndicate with fingers in gambling and sex work across Night City. Run by David Ling Po. Wild Things: A boostergang that channels its violent impulses through gladiatorial combat at the Redline. Willows: Less a gang and more a therapy group made up of female combat veterans. Yellow Brick Road Gang: A poser gang modeled after The Wizard of Oz. The Zoners: A movement dedicated to improving the living conditions in South Night City through community organization and protest.","cat":"shop","u":0.43591,"v":0.65612,"x":43.591,"z":97.364}],"x":62,"z":88,"w":13,"d":10,"tier":1,"accent":"#4db6ac","threat":3,"locationCount":5,"zone":"suburbs","anchor":{"x":45.792,"z":99.632,"rx":9.92,"rz":7.33},"mapped":5}];

const NC_FACTIONS = [
  {
    "name": "Dead Woods",
    "districts": [
      "G",
      "I",
      "J",
      "S",
      "U"
    ],
    "color": "#ff2d95",
    "reach": 5
  },
  {
    "name": "Tyger Claws",
    "districts": [
      "H",
      "I",
      "N",
      "O",
      "Q"
    ],
    "color": "#00e5ff",
    "reach": 5
  },
  {
    "name": "6th Street",
    "districts": [
      "A",
      "T",
      "W",
      "X"
    ],
    "color": "#ffd600",
    "reach": 4
  },
  {
    "name": "Maelstrom",
    "districts": [
      "A",
      "B",
      "D",
      "H"
    ],
    "color": "#69f0ae",
    "reach": 4
  },
  {
    "name": "Kill Krashers",
    "districts": [
      "G",
      "I",
      "V"
    ],
    "color": "#7c4dff",
    "reach": 3
  },
  {
    "name": "Prime-Time Players",
    "districts": [
      "B",
      "P",
      "Q"
    ],
    "color": "#ff9100",
    "reach": 3
  },
  {
    "name": "The Enhanced",
    "districts": [
      "I",
      "U",
      "W"
    ],
    "color": "#ff1744",
    "reach": 3
  },
  {
    "name": "Tombstone Preservers",
    "districts": [
      "K",
      "P",
      "Q"
    ],
    "color": "#4db6ac",
    "reach": 3
  },
  {
    "name": "Arzin Tynon",
    "districts": [
      "N",
      "P"
    ],
    "color": "#b388ff",
    "reach": 2
  },
  {
    "name": "Consortium",
    "districts": [
      "J",
      "U"
    ],
    "color": "#ff6ec7",
    "reach": 2
  },
  {
    "name": "G3",
    "districts": [
      "N",
      "O"
    ],
    "color": "#8d99ae",
    "reach": 2
  },
  {
    "name": "Iron Sights",
    "districts": [
      "H",
      "L"
    ],
    "color": "#f06292",
    "reach": 2
  },
  {
    "name": "Kanzaki Family",
    "districts": [
      "I",
      "N"
    ],
    "color": "#26c6da",
    "reach": 2
  },
  {
    "name": "Red Chrome Legion",
    "districts": [
      "E",
      "H"
    ],
    "color": "#9ccc65",
    "reach": 2
  },
  {
    "name": "Skiv Family",
    "districts": [
      "C",
      "S"
    ],
    "color": "#ffa726",
    "reach": 2
  },
  {
    "name": "Steel Vaqueros",
    "districts": [
      "V",
      "X"
    ],
    "color": "#ef5350",
    "reach": 2
  },
  {
    "name": "Street Queens",
    "districts": [
      "B",
      "P"
    ],
    "color": "#ff2d95",
    "reach": 2
  },
  {
    "name": "The Reckoners",
    "districts": [
      "G",
      "I"
    ],
    "color": "#00e5ff",
    "reach": 2
  },
  {
    "name": "The Shroomers",
    "districts": [
      "H",
      "L"
    ],
    "color": "#ffd600",
    "reach": 2
  },
  {
    "name": "Undertow",
    "districts": [
      "A",
      "C"
    ],
    "color": "#69f0ae",
    "reach": 2
  },
  {
    "name": "Voodoo Boys",
    "districts": [
      "W",
      "X"
    ],
    "color": "#7c4dff",
    "reach": 2
  },
  {
    "name": "Weng Fang Tong",
    "districts": [
      "E",
      "G"
    ],
    "color": "#ff9100",
    "reach": 2
  },
  {
    "name": "Albino Alligators",
    "districts": [
      "X"
    ],
    "color": "#ff1744",
    "reach": 1
  },
  {
    "name": "Bozos",
    "districts": [
      "I"
    ],
    "color": "#4db6ac",
    "reach": 1
  },
  {
    "name": "Culper Ring",
    "districts": [
      "M"
    ],
    "color": "#b388ff",
    "reach": 1
  },
  {
    "name": "Dirty Hippies",
    "districts": [
      "X"
    ],
    "color": "#ff6ec7",
    "reach": 1
  },
  {
    "name": "Dragula Racers",
    "districts": [
      "N"
    ],
    "color": "#8d99ae",
    "reach": 1
  },
  {
    "name": "Eastern Tigers Triad",
    "districts": [
      "C"
    ],
    "color": "#f06292",
    "reach": 1
  },
  {
    "name": "Edgerunners Inc",
    "districts": [
      "L"
    ],
    "color": "#26c6da",
    "reach": 1
  },
  {
    "name": "El Norte Cartel",
    "districts": [
      "V"
    ],
    "color": "#9ccc65",
    "reach": 1
  },
  {
    "name": "Eurotrashers",
    "districts": [
      "A"
    ],
    "color": "#ffa726",
    "reach": 1
  },
  {
    "name": "Fixie’s Couriers",
    "districts": [
      "U"
    ],
    "color": "#ef5350",
    "reach": 1
  },
  {
    "name": "Generation Red",
    "districts": [
      "L"
    ],
    "color": "#ff2d95",
    "reach": 1
  },
  {
    "name": "Gold Dragons",
    "districts": [
      "E"
    ],
    "color": "#00e5ff",
    "reach": 1
  },
  {
    "name": "Inquisitors",
    "districts": [
      "T"
    ],
    "color": "#ffd600",
    "reach": 1
  },
  {
    "name": "Lightning Cats",
    "districts": [
      "D"
    ],
    "color": "#69f0ae",
    "reach": 1
  },
  {
    "name": "Mudang Gumi",
    "districts": [
      "W"
    ],
    "color": "#7c4dff",
    "reach": 1
  },
  {
    "name": "Philharmonic Vampyres",
    "districts": [
      "F"
    ],
    "color": "#ff9100",
    "reach": 1
  },
  {
    "name": "Piranhas",
    "districts": [
      "W"
    ],
    "color": "#ff1744",
    "reach": 1
  },
  {
    "name": "Princesses of Justice",
    "districts": [
      "F"
    ],
    "color": "#4db6ac",
    "reach": 1
  },
  {
    "name": "Rat Kings",
    "districts": [
      "V"
    ],
    "color": "#b388ff",
    "reach": 1
  },
  {
    "name": "Reckoners",
    "districts": [
      "D"
    ],
    "color": "#ff6ec7",
    "reach": 1
  },
  {
    "name": "The Andersons",
    "districts": [
      "W"
    ],
    "color": "#8d99ae",
    "reach": 1
  },
  {
    "name": "The Faded",
    "districts": [
      "L"
    ],
    "color": "#f06292",
    "reach": 1
  },
  {
    "name": "The Muses",
    "districts": [
      "T"
    ],
    "color": "#26c6da",
    "reach": 1
  },
  {
    "name": "The Sinful Adams",
    "districts": [
      "I"
    ],
    "color": "#9ccc65",
    "reach": 1
  },
  {
    "name": "The Toecutters",
    "districts": [
      "T"
    ],
    "color": "#ffa726",
    "reach": 1
  },
  {
    "name": "The Zoners",
    "districts": [
      "I"
    ],
    "color": "#ef5350",
    "reach": 1
  },
  {
    "name": "various Scavver groups",
    "districts": [
      "D"
    ],
    "color": "#ff2d95",
    "reach": 1
  },
  {
    "name": "Wild Things",
    "districts": [
      "N"
    ],
    "color": "#00e5ff",
    "reach": 1
  }
];

const NC_REGIONS = ['The Island','Northside','Mainland','Southside'];

const NC_LAYERS = {
  "zones": {
    "label": "Zones",
    "items": [
      {
        "key": "combat",
        "label": "Combat Zone",
        "color": "#ff1744"
      },
      {
        "key": "executive",
        "label": "Executive Sector",
        "color": "#ffd600"
      },
      {
        "key": "rebuilding",
        "label": "Urban Rebuilding Zone",
        "color": "#00e5ff"
      },
      {
        "key": "suburbs",
        "label": "Overpacked Suburbs",
        "color": "#ff9100"
      },
      {
        "key": "urban",
        "label": "Urban Core",
        "color": "#7c4dff"
      }
    ]
  },
  "places": {
    "label": "Places",
    "items": [
      {
        "key": "threat",
        "label": "Threat Level",
        "color": "#ff1744",
        "overlay": true
      },
      {
        "key": "corporation",
        "label": "Corporations",
        "color": "#00e5ff"
      },
      {
        "key": "entertainment",
        "label": "Entertainment",
        "color": "#ff2d95"
      },
      {
        "key": "landmark",
        "label": "Landmarks",
        "color": "#ffd600"
      },
      {
        "key": "neighborhood",
        "label": "Neighborhoods",
        "color": "#8d99ae"
      },
      {
        "key": "lodging",
        "label": "Lodging",
        "color": "#69f0ae"
      },
      {
        "key": "organization",
        "label": "Organizations",
        "color": "#b388ff"
      },
      {
        "key": "safehouse",
        "label": "Safehouse",
        "color": "#4db6ac"
      },
      {
        "key": "other",
        "label": "Other",
        "color": "#607d8b"
      }
    ]
  },
  "vendors": {
    "label": "Vendors",
    "items": [
      {
        "key": "bar",
        "label": "Bar",
        "color": "#ff6ec7"
      },
      {
        "key": "food",
        "label": "Food",
        "color": "#ffa726"
      },
      {
        "key": "ripperdoc",
        "label": "Ripper Doc",
        "color": "#ef5350"
      },
      {
        "key": "shop",
        "label": "Shop",
        "color": "#26c6da"
      }
    ]
  },
  "people": {
    "label": "People",
    "items": [
      {
        "key": "factions",
        "label": "Factions",
        "color": "#ff2d95",
        "overlay": true
      }
    ]
  }
};

if (typeof module !== "undefined") module.exports = { NC_MAP, NC_MAP_DATA, NC_FACTIONS, NC_REGIONS, NC_LAYERS };

// District boundaries traced from the map's own red dotted borders (and the
// shoreline, where the printed border stops over open water). Normalised (u,v)
// like the location pins: x = u * worldW, z = v * worldH. Each district is a
// list of shapes; "o" is the outer ring, "h" any holes.
// Regenerate with: node tools/trace-district-polys.js --write
const NC_DISTRICT_POLYS = {"A":[{"o":[[0.2656,0.4057],[0.2651,0.4038],[0.2681,0.4031],[0.2676,0.4021],[0.2686,0.4021],[0.2695,0.3998],[0.271,0.4001],[0.2715,0.3988],[0.2769,0.3972],[0.2783,0.3942],[0.2803,0.3949],[0.2803,0.3939],[0.2842,0.3919],[0.2876,0.3919],[0.2886,0.3909],[0.2944,0.3909],[0.2944,0.3896],[0.2998,0.3896],[0.3032,0.3919],[0.3032,0.3936],[0.3081,0.3936],[0.3081,0.3899],[0.3037,0.3903],[0.3003,0.388],[0.3013,0.385],[0.3027,0.3857],[0.3052,0.3843],[0.3125,0.384],[0.3203,0.3801],[0.3281,0.3807],[0.3325,0.3791],[0.3369,0.3787],[0.3462,0.3751],[0.354,0.3708],[0.3574,0.3722],[0.3574,0.3751],[0.3618,0.3751],[0.3628,0.3718],[0.3677,0.3718],[0.3711,0.3731],[0.377,0.3731],[0.3838,0.3708],[0.3877,0.3708],[0.3921,0.3692],[0.3999,0.3685],[0.4014,0.3672],[0.4106,0.3649],[0.4224,0.3649],[0.4238,0.3623],[0.4258,0.3633],[0.4253,0.3659],[0.4263,0.3662],[0.4282,0.362],[0.4302,0.3629],[0.4297,0.3656],[0.4321,0.3653],[0.4336,0.3662],[0.4331,0.3682],[0.4336,0.384],[0.4302,0.3863],[0.4233,0.3863],[0.4233,0.3899],[0.4272,0.3899],[0.4307,0.3922],[0.4302,0.3939],[0.4243,0.3978],[0.4214,0.3975],[0.4204,0.4001],[0.4106,0.4067],[0.4097,0.4156],[0.4063,0.4179],[0.4009,0.4179],[0.4009,0.4215],[0.4028,0.4215],[0.4063,0.4238],[0.4063,0.4393],[0.4048,0.4482],[0.4058,0.4508],[0.4023,0.4531],[0.3452,0.4534],[0.3418,0.4511],[0.3413,0.4396],[0.3442,0.4376],[0.3535,0.4376],[0.3535,0.4344],[0.3442,0.4344],[0.3413,0.4324],[0.3418,0.4268],[0.3408,0.4261],[0.3423,0.4182],[0.3413,0.4179],[0.3413,0.4146],[0.3452,0.4113],[0.3506,0.4113],[0.3516,0.412],[0.3516,0.4077],[0.3252,0.4077],[0.3242,0.4067],[0.3188,0.4067],[0.3174,0.408],[0.314,0.4074],[0.2969,0.408],[0.2964,0.4074],[0.2925,0.4074],[0.2813,0.408],[0.2793,0.407],[0.2744,0.4074],[0.2725,0.4057],[0.2695,0.4077],[0.2681,0.407]]}],"B":[{"o":[[0.4375,0.3643],[0.4458,0.3643],[0.4556,0.3666],[0.4619,0.3666],[0.4639,0.3682],[0.4678,0.3692],[0.4746,0.3682],[0.4746,0.3669],[0.4751,0.3679],[0.4814,0.3676],[0.4844,0.3689],[0.4902,0.3695],[0.502,0.3695],[0.5044,0.3685],[0.5137,0.3679],[0.5142,0.3685],[0.5166,0.3682],[0.5166,0.3692],[0.5225,0.3712],[0.5293,0.3712],[0.5308,0.3702],[0.5352,0.3708],[0.5356,0.3702],[0.5439,0.3725],[0.5435,0.3731],[0.5449,0.3735],[0.564,0.3738],[0.5645,0.3731],[0.5649,0.3741],[0.5703,0.3745],[0.5708,0.3755],[0.5732,0.3751],[0.5732,0.3764],[0.5752,0.3761],[0.5742,0.3771],[0.5786,0.3791],[0.5806,0.3824],[0.5835,0.383],[0.5825,0.384],[0.5835,0.3847],[0.5859,0.3843],[0.5869,0.386],[0.5884,0.3857],[0.5913,0.3876],[0.5913,0.3939],[0.6011,0.3942],[0.6045,0.3991],[0.6055,0.3985],[0.606,0.4001],[0.6069,0.4001],[0.6069,0.3991],[0.6084,0.3998],[0.6074,0.4005],[0.6133,0.4061],[0.6128,0.4077],[0.6108,0.4087],[0.6123,0.4126],[0.6172,0.412],[0.6274,0.4123],[0.6289,0.4087],[0.626,0.4054],[0.6235,0.3991],[0.6211,0.3988],[0.6216,0.3975],[0.6191,0.3972],[0.6182,0.3955],[0.6094,0.3909],[0.6099,0.3896],[0.6089,0.3896],[0.605,0.3847],[0.6025,0.3847],[0.6016,0.3827],[0.5957,0.3797],[0.5962,0.3791],[0.5933,0.3764],[0.5913,0.3764],[0.5923,0.3758],[0.5894,0.3731],[0.5879,0.3735],[0.5869,0.3728],[0.5874,0.3715],[0.585,0.3708],[0.5859,0.3695],[0.584,0.3692],[0.5776,0.3629],[0.5625,0.3527],[0.5605,0.3501],[0.5586,0.3501],[0.5596,0.3491],[0.5581,0.3485],[0.5586,0.3478],[0.5508,0.3422],[0.5464,0.336],[0.5459,0.3333],[0.5449,0.3333],[0.5454,0.331],[0.5439,0.3287],[0.5425,0.3284],[0.543,0.3277],[0.541,0.3277],[0.5425,0.3271],[0.542,0.3258],[0.5405,0.3258],[0.542,0.3228],[0.5405,0.3231],[0.54,0.3225],[0.5425,0.3221],[0.5425,0.3208],[0.541,0.3185],[0.5352,0.3166],[0.5337,0.3172],[0.5337,0.3166],[0.5317,0.3166],[0.5313,0.3175],[0.5303,0.3166],[0.5313,0.3162],[0.5278,0.3152],[0.5269,0.3004],[0.5293,0.2988],[0.54,0.3001],[0.5435,0.3024],[0.5435,0.3064],[0.5479,0.3064],[0.5479,0.305],[0.5513,0.3027],[0.5591,0.3037],[0.5645,0.3067],[0.5645,0.309],[0.5674,0.3113],[0.5688,0.3166],[0.5679,0.3179],[0.5698,0.3189],[0.5703,0.3215],[0.582,0.3317],[0.582,0.3327],[0.5874,0.3373],[0.5874,0.3386],[0.5913,0.3409],[0.5952,0.3458],[0.603,0.3521],[0.605,0.3554],[0.6123,0.3613],[0.6138,0.3646],[0.6191,0.3656],[0.6411,0.3771],[0.6387,0.3906],[0.6431,0.3932],[0.6426,0.3945],[0.644,0.3945],[0.6475,0.3968],[0.6602,0.4064],[0.6558,0.4245],[0.6548,0.4274],[0.6514,0.4297],[0.646,0.4278],[0.644,0.4317],[0.6411,0.4301],[0.6172,0.4311],[0.6157,0.4301],[0.6147,0.4311],[0.6079,0.4311],[0.605,0.4301],[0.5986,0.4301],[0.5967,0.4314],[0.5835,0.4321],[0.5752,0.4383],[0.5669,0.4413],[0.5635,0.439],[0.5615,0.4294],[0.5596,0.4258],[0.5576,0.4248],[0.5571,0.4222],[0.5542,0.4222],[0.5503,0.4192],[0.5483,0.4192],[0.542,0.4156],[0.5264,0.4133],[0.5244,0.4116],[0.5215,0.411],[0.5181,0.4087],[0.5171,0.4061],[0.5137,0.4041],[0.5171,0.4014],[0.519,0.4014],[0.5186,0.3982],[0.5132,0.3982],[0.5107,0.4001],[0.5093,0.4001],[0.5044,0.3965],[0.5039,0.3926],[0.502,0.3906],[0.4927,0.3893],[0.4751,0.3889],[0.4751,0.3883],[0.4517,0.388],[0.4482,0.3857],[0.4482,0.3804],[0.4434,0.3804],[0.4434,0.383],[0.4399,0.3853],[0.4365,0.3853],[0.4336,0.3833],[0.4331,0.3656],[0.4346,0.3653]]}],"C":[{"o":[[0.3125,0.4077],[0.313,0.4084],[0.313,0.4077],[0.3213,0.4077],[0.3247,0.41],[0.3247,0.412],[0.3286,0.412],[0.3286,0.41],[0.332,0.4077],[0.3379,0.4077],[0.3413,0.4103],[0.3413,0.4261],[0.3398,0.4288],[0.3413,0.4291],[0.3413,0.4442],[0.3403,0.4446],[0.3413,0.4446],[0.3413,0.4511],[0.3394,0.4525],[0.3379,0.4534],[0.3208,0.4538],[0.3174,0.4515],[0.3174,0.4459],[0.3105,0.4459],[0.3052,0.4426],[0.272,0.4426],[0.27,0.439],[0.272,0.435],[0.2788,0.435],[0.2852,0.4337],[0.2949,0.434],[0.2964,0.4324],[0.311,0.4324],[0.311,0.4288],[0.2983,0.4288],[0.2983,0.4297],[0.2954,0.4314],[0.2842,0.4278],[0.2788,0.4228],[0.272,0.4205],[0.2744,0.414],[0.272,0.4126],[0.2695,0.4093],[0.272,0.4077]]}],"D":[{"o":[[0.4443,0.3952],[0.4556,0.3955],[0.4565,0.3982],[0.4546,0.3995],[0.4629,0.3991],[0.4629,0.3982],[0.4609,0.3978],[0.4609,0.3952],[0.4624,0.3942],[0.4668,0.3945],[0.4702,0.3962],[0.4756,0.3972],[0.4888,0.3965],[0.4937,0.3975],[0.4966,0.4038],[0.5044,0.408],[0.5059,0.41],[0.5039,0.4107],[0.4985,0.41],[0.4985,0.4107],[0.5034,0.4107],[0.5039,0.4116],[0.5054,0.4116],[0.5049,0.414],[0.5078,0.4186],[0.5142,0.4199],[0.5156,0.4212],[0.5166,0.4212],[0.5166,0.4195],[0.52,0.4199],[0.5264,0.4225],[0.5254,0.4235],[0.5234,0.4232],[0.5225,0.4238],[0.5273,0.4248],[0.5269,0.4235],[0.5278,0.4232],[0.5298,0.4242],[0.5283,0.4248],[0.5308,0.4265],[0.5322,0.4265],[0.5313,0.4255],[0.5327,0.4251],[0.5337,0.4258],[0.5327,0.4261],[0.5347,0.4265],[0.5352,0.4274],[0.5391,0.4281],[0.5391,0.4291],[0.5449,0.4307],[0.5469,0.433],[0.5469,0.4353],[0.5454,0.437],[0.5474,0.4367],[0.5464,0.4423],[0.5483,0.4446],[0.5527,0.4469],[0.5527,0.4485],[0.5493,0.4521],[0.5464,0.4548],[0.5405,0.4571],[0.5352,0.4571],[0.5303,0.4584],[0.5259,0.4584],[0.52,0.4567],[0.5034,0.4574],[0.4961,0.4603],[0.4844,0.462],[0.4795,0.4646],[0.4565,0.4673],[0.4556,0.4686],[0.4561,0.4715],[0.4746,0.4699],[0.4761,0.4712],[0.4717,0.4742],[0.4536,0.4752],[0.4458,0.4742],[0.4424,0.4715],[0.4434,0.4709],[0.4512,0.4709],[0.4521,0.4673],[0.4399,0.4663],[0.4336,0.462],[0.4287,0.4603],[0.4214,0.4528],[0.4214,0.4475],[0.4185,0.4393],[0.4185,0.436],[0.4214,0.4317],[0.4214,0.4271],[0.4189,0.4238],[0.4194,0.4209],[0.4224,0.4182],[0.4272,0.4159],[0.4272,0.4097],[0.4321,0.4018],[0.4336,0.4011]]}],"E":[{"o":[[0.561,0.4824],[0.561,0.4801],[0.5566,0.4752],[0.5513,0.4643],[0.5547,0.4617],[0.5571,0.4567],[0.5649,0.4501],[0.564,0.4432],[0.5674,0.4409],[0.5698,0.4409],[0.5708,0.4399],[0.5771,0.4383],[0.5864,0.4317],[0.5967,0.4314],[0.5977,0.4307],[0.6021,0.4314],[0.603,0.4307],[0.6401,0.4307],[0.6431,0.4321],[0.6426,0.4337],[0.6523,0.4393],[0.6538,0.4393],[0.6572,0.4423],[0.6587,0.4423],[0.6582,0.4429],[0.6597,0.4426],[0.6602,0.4432],[0.6558,0.4449],[0.647,0.4528],[0.6455,0.4528],[0.6445,0.4544],[0.6406,0.4567],[0.6406,0.4577],[0.625,0.4692],[0.6255,0.4699],[0.6226,0.4712],[0.623,0.4719],[0.6216,0.4719],[0.6167,0.4765],[0.6138,0.4778],[0.6138,0.4788],[0.6123,0.4791],[0.6133,0.4804],[0.6108,0.4821],[0.6089,0.4817],[0.6069,0.4827],[0.606,0.4847],[0.5889,0.4847],[0.5874,0.4837],[0.585,0.4847],[0.5835,0.4834],[0.582,0.4834],[0.5806,0.4847],[0.5713,0.4837],[0.5693,0.485],[0.5649,0.485],[0.563,0.4837]]}],"F":[{"o":[[0.2656,0.4682],[0.2642,0.4669],[0.2642,0.461],[0.2646,0.46],[0.2695,0.458],[0.272,0.4426],[0.3047,0.4426],[0.3091,0.4465],[0.3115,0.4521],[0.314,0.4534],[0.3408,0.4531],[0.3428,0.4541],[0.3457,0.4541],[0.3462,0.4534],[0.3843,0.4531],[0.3872,0.4551],[0.3872,0.4584],[0.3945,0.458],[0.3945,0.4603],[0.3975,0.46],[0.3979,0.4643],[0.3945,0.4666],[0.3921,0.4663],[0.3901,0.4646],[0.3877,0.465],[0.3848,0.4669],[0.3848,0.4778],[0.3813,0.4801],[0.354,0.4801],[0.3506,0.4778],[0.3506,0.4745],[0.3467,0.4745],[0.3467,0.4778],[0.3433,0.4801],[0.2793,0.4808],[0.2759,0.4784],[0.2759,0.4729],[0.272,0.4729],[0.272,0.4784],[0.2686,0.4808],[0.2671,0.4808],[0.2656,0.4775],[0.2646,0.4775],[0.2642,0.4742]]}],"G":[{"o":[[0.3911,0.4659],[0.395,0.4682],[0.3975,0.4682],[0.4072,0.4725],[0.415,0.4742],[0.4165,0.4755],[0.4243,0.4775],[0.4253,0.4784],[0.4297,0.4784],[0.4312,0.4758],[0.436,0.4722],[0.4414,0.4729],[0.4453,0.4745],[0.4531,0.4748],[0.4565,0.4771],[0.4565,0.4811],[0.4634,0.4811],[0.4634,0.4768],[0.4663,0.4748],[0.4771,0.4735],[0.4805,0.4722],[0.4844,0.4722],[0.4868,0.4709],[0.4897,0.4725],[0.4902,0.4949],[0.4868,0.4972],[0.4834,0.4972],[0.4834,0.5008],[0.4883,0.5008],[0.4902,0.5018],[0.4951,0.5058],[0.4951,0.5084],[0.4932,0.5094],[0.4941,0.5107],[0.4932,0.5107],[0.4932,0.5153],[0.4907,0.5199],[0.4902,0.5242],[0.4893,0.5245],[0.4868,0.539],[0.4883,0.5433],[0.479,0.5508],[0.4756,0.5518],[0.4673,0.5525],[0.4658,0.5515],[0.4629,0.5531],[0.4609,0.5568],[0.4575,0.5591],[0.4263,0.5574],[0.4243,0.5564],[0.4238,0.5571],[0.416,0.5568],[0.4131,0.5564],[0.4097,0.5541],[0.4072,0.5489],[0.3999,0.5403],[0.3999,0.539],[0.3984,0.5383],[0.3984,0.5367],[0.3926,0.5301],[0.3926,0.5285],[0.3896,0.5258],[0.3896,0.5245],[0.3882,0.5239],[0.3877,0.5219],[0.3911,0.5199],[0.3911,0.516],[0.3838,0.516],[0.3804,0.5137],[0.376,0.5074],[0.377,0.5038],[0.3809,0.5012],[0.3848,0.4939],[0.3843,0.4702],[0.3848,0.4682],[0.3882,0.4659]]}],"H":[{"o":[[0.4897,0.4715],[0.4932,0.4692],[0.4956,0.4692],[0.502,0.4659],[0.5112,0.464],[0.5137,0.464],[0.5171,0.4663],[0.5171,0.4682],[0.522,0.4682],[0.5254,0.4653],[0.5278,0.4653],[0.5288,0.4663],[0.5313,0.4663],[0.5347,0.4686],[0.5347,0.4715],[0.5396,0.4715],[0.5396,0.4679],[0.5439,0.465],[0.5483,0.464],[0.5522,0.4663],[0.5542,0.4689],[0.5552,0.4729],[0.5566,0.4735],[0.5586,0.4794],[0.5596,0.4798],[0.5601,0.4824],[0.5591,0.4831],[0.5601,0.4837],[0.5625,0.4847],[0.5703,0.4847],[0.5708,0.4854],[0.5786,0.4847],[0.5806,0.4863],[0.5835,0.4844],[0.5996,0.4844],[0.6021,0.486],[0.6001,0.4877],[0.5938,0.4916],[0.5898,0.4949],[0.5903,0.4956],[0.5884,0.4962],[0.5859,0.4992],[0.5732,0.509],[0.5728,0.5107],[0.5703,0.5117],[0.5581,0.5225],[0.5474,0.515],[0.5449,0.515],[0.5337,0.5081],[0.5322,0.509],[0.5059,0.509],[0.5054,0.5084],[0.5054,0.509],[0.498,0.509],[0.4951,0.5071],[0.4946,0.5041],[0.4902,0.5002],[0.4907,0.4831],[0.4897,0.4725]]}],"I":[{"o":[[0.2686,0.4804],[0.335,0.4804],[0.3364,0.4798],[0.3486,0.4798],[0.3491,0.4804],[0.3491,0.4798],[0.354,0.4798],[0.3584,0.4821],[0.3584,0.485],[0.3618,0.485],[0.3618,0.4821],[0.3647,0.4801],[0.3711,0.4801],[0.374,0.4821],[0.374,0.4877],[0.3774,0.4877],[0.3774,0.4821],[0.3804,0.4801],[0.3818,0.4801],[0.3848,0.4821],[0.3843,0.4956],[0.3813,0.4995],[0.3779,0.5018],[0.3765,0.5021],[0.375,0.5008],[0.3696,0.5008],[0.3696,0.5031],[0.3701,0.5044],[0.3726,0.5044],[0.376,0.5067],[0.3794,0.5137],[0.3809,0.5143],[0.3838,0.5192],[0.3857,0.5202],[0.3916,0.5295],[0.3931,0.5301],[0.3931,0.5318],[0.396,0.5344],[0.395,0.5357],[0.3975,0.5364],[0.4019,0.5436],[0.4038,0.5446],[0.4048,0.5466],[0.4028,0.5475],[0.4038,0.5475],[0.4038,0.5489],[0.4077,0.5512],[0.4106,0.5558],[0.416,0.5568],[0.4351,0.5577],[0.438,0.5597],[0.438,0.562],[0.4414,0.5617],[0.4414,0.5604],[0.4443,0.5584],[0.457,0.5591],[0.4604,0.5614],[0.4619,0.5647],[0.4668,0.5689],[0.4668,0.5706],[0.4712,0.5752],[0.4722,0.5791],[0.4692,0.5798],[0.4497,0.5805],[0.4502,0.5851],[0.4473,0.5857],[0.4458,0.5805],[0.4126,0.5818],[0.4063,0.5785],[0.3965,0.5785],[0.3882,0.5808],[0.3809,0.5801],[0.377,0.5831],[0.3643,0.5851],[0.3618,0.5851],[0.3604,0.5841],[0.3604,0.5821],[0.3574,0.5821],[0.3574,0.5851],[0.3564,0.5857],[0.3516,0.5857],[0.3369,0.5824],[0.3267,0.5818],[0.3179,0.5788],[0.3154,0.5758],[0.3174,0.5739],[0.332,0.5755],[0.3364,0.5765],[0.3374,0.5775],[0.3423,0.5772],[0.3491,0.5749],[0.3594,0.5732],[0.3643,0.5712],[0.3726,0.5696],[0.3774,0.567],[0.3799,0.5666],[0.3818,0.5591],[0.3804,0.5541],[0.3799,0.5469],[0.3809,0.5459],[0.3794,0.5446],[0.3794,0.5331],[0.3784,0.5304],[0.376,0.5291],[0.376,0.5278],[0.374,0.5278],[0.3706,0.5255],[0.3691,0.5265],[0.3594,0.5265],[0.3574,0.5255],[0.3545,0.5265],[0.3447,0.5265],[0.3418,0.5252],[0.3374,0.5271],[0.3315,0.5271],[0.3032,0.5239],[0.2998,0.5216],[0.3003,0.4975],[0.2988,0.4956],[0.2988,0.4942],[0.3022,0.4923],[0.3022,0.4883],[0.2988,0.4883],[0.2988,0.4913],[0.2954,0.4936],[0.2676,0.4936],[0.2666,0.4929],[0.2656,0.4936],[0.2646,0.4926],[0.2656,0.4923],[0.2637,0.4913],[0.2637,0.487],[0.2656,0.486],[0.2656,0.485]]}],"J":[{"o":[[0.3062,0.5607],[0.3047,0.5607],[0.3013,0.5584],[0.3013,0.5554],[0.3027,0.5548],[0.3037,0.5554],[0.3047,0.5525],[0.3042,0.5495],[0.3013,0.5472],[0.3013,0.5423],[0.3037,0.5377],[0.3086,0.537],[0.3086,0.5334],[0.3027,0.5334],[0.2891,0.5295],[0.2925,0.5268],[0.2925,0.5232],[0.2964,0.5209],[0.3013,0.5235],[0.3101,0.5252],[0.3188,0.5255],[0.3325,0.5275],[0.3384,0.5268],[0.3398,0.5281],[0.3428,0.5265],[0.3511,0.5262],[0.3521,0.5271],[0.3545,0.5288],[0.3491,0.5331],[0.3491,0.5344],[0.3457,0.5364],[0.3442,0.54],[0.3374,0.5462],[0.3345,0.5512],[0.3315,0.5535],[0.3315,0.5551],[0.3281,0.5574],[0.3281,0.5587],[0.3232,0.5643],[0.3125,0.5729],[0.3076,0.5719],[0.3062,0.5706]]},{"o":[[0.2949,0.4936],[0.3003,0.4975],[0.3003,0.515],[0.2969,0.5173],[0.2935,0.5173],[0.2935,0.5209],[0.29,0.5232],[0.2886,0.5232],[0.2886,0.5275],[0.2871,0.5285],[0.2803,0.5268],[0.2847,0.5071],[0.2827,0.5054],[0.2764,0.5041],[0.2739,0.5021],[0.271,0.5015],[0.2686,0.4956],[0.27,0.4936]]}],"K":[{"o":[[0.3149,0.5716],[0.3242,0.5643],[0.3242,0.563],[0.3262,0.562],[0.3276,0.5591],[0.3306,0.5568],[0.3306,0.5554],[0.3369,0.5492],[0.3384,0.5459],[0.3452,0.54],[0.3467,0.5367],[0.354,0.5301],[0.3535,0.5295],[0.3589,0.5262],[0.3711,0.5262],[0.375,0.5285],[0.3789,0.5314],[0.3794,0.5331],[0.3804,0.5505],[0.377,0.5528],[0.3716,0.5528],[0.3711,0.5568],[0.3784,0.5568],[0.3818,0.5591],[0.3799,0.5653],[0.3711,0.5699],[0.3618,0.5716],[0.3574,0.5735],[0.3511,0.5742],[0.3438,0.5768],[0.3364,0.5768],[0.3281,0.5749],[0.3179,0.5739]]}],"L":[{"o":[[0.4707,0.5735],[0.4692,0.5729],[0.4697,0.5716],[0.4678,0.5709],[0.4648,0.5656],[0.4614,0.563],[0.46,0.5587],[0.4668,0.5525],[0.4766,0.5515],[0.4785,0.5522],[0.4878,0.5446],[0.4883,0.5413],[0.4868,0.539],[0.4883,0.5367],[0.4878,0.5331],[0.4907,0.5202],[0.4927,0.5192],[0.4922,0.5169],[0.4937,0.5163],[0.4941,0.511],[0.4976,0.5087],[0.5083,0.509],[0.5112,0.511],[0.5112,0.5163],[0.5132,0.5163],[0.5142,0.5173],[0.5161,0.5173],[0.5151,0.5166],[0.5151,0.511],[0.5181,0.509],[0.5273,0.509],[0.5303,0.511],[0.5303,0.516],[0.5337,0.516],[0.5337,0.5143],[0.5371,0.512],[0.5391,0.512],[0.5439,0.5146],[0.5503,0.5183],[0.5464,0.5212],[0.5464,0.5245],[0.5503,0.5245],[0.5503,0.5229],[0.5542,0.5206],[0.5576,0.5229],[0.5562,0.5239],[0.5562,0.5255],[0.5552,0.5248],[0.5547,0.5262],[0.5532,0.5262],[0.543,0.536],[0.5376,0.5397],[0.5361,0.542],[0.5342,0.5426],[0.5337,0.5443],[0.5317,0.5446],[0.5273,0.5495],[0.5166,0.5581],[0.5146,0.561],[0.5137,0.5607],[0.5132,0.562],[0.5117,0.5624],[0.5122,0.5633],[0.5098,0.564],[0.5063,0.5679],[0.5054,0.5676],[0.5005,0.5732],[0.4985,0.5729],[0.498,0.5739],[0.4849,0.5795],[0.4731,0.5798],[0.4722,0.5785]]}],"M":[{"o":[[0.2207,0.2455],[0.2261,0.2412],[0.2261,0.2399],[0.2285,0.2389],[0.228,0.2382],[0.2339,0.2333],[0.2339,0.2323],[0.2417,0.2261],[0.2432,0.2231],[0.2451,0.2221],[0.2451,0.2208],[0.2495,0.2185],[0.2495,0.2172],[0.2573,0.2109],[0.2588,0.208],[0.2656,0.2027],[0.27,0.1981],[0.27,0.1968],[0.2734,0.1945],[0.2827,0.1915],[0.2866,0.1889],[0.2886,0.1889],[0.3008,0.183],[0.3052,0.182],[0.312,0.178],[0.3193,0.1757],[0.3262,0.1721],[0.3291,0.1721],[0.333,0.1701],[0.3354,0.1708],[0.3364,0.1695],[0.3398,0.1695],[0.3423,0.1675],[0.3452,0.1675],[0.3516,0.1652],[0.3535,0.1658],[0.355,0.1642],[0.3604,0.1635],[0.3613,0.1626],[0.3662,0.1619],[0.3672,0.1609],[0.3701,0.1609],[0.3735,0.1596],[0.3906,0.1596],[0.4053,0.1668],[0.4072,0.1668],[0.4087,0.1681],[0.4131,0.1681],[0.4238,0.1728],[0.4243,0.1737],[0.4268,0.1737],[0.4312,0.1695],[0.4312,0.1681],[0.4331,0.1678],[0.4629,0.1813],[0.4648,0.181],[0.4648,0.18],[0.4707,0.1747],[0.4702,0.1731],[0.4717,0.1721],[0.4741,0.1721],[0.4775,0.1747],[0.4795,0.1747],[0.4941,0.182],[0.4961,0.182],[0.4985,0.1833],[0.502,0.1856],[0.501,0.1872],[0.5005,0.1892],[0.4839,0.203],[0.4839,0.2043],[0.4795,0.207],[0.4795,0.208],[0.4751,0.2106],[0.4731,0.2132],[0.4692,0.2155],[0.4692,0.2168],[0.4668,0.2182],[0.4668,0.2201],[0.4688,0.2211],[0.4688,0.2224],[0.4736,0.2274],[0.4702,0.2297],[0.4653,0.23],[0.4644,0.2313],[0.4624,0.231],[0.4609,0.2323],[0.4556,0.2333],[0.4521,0.2353],[0.4492,0.2353],[0.4458,0.233],[0.4458,0.2307],[0.4404,0.2307],[0.4409,0.2369],[0.4375,0.2382],[0.438,0.2389],[0.4365,0.2399],[0.4312,0.2412],[0.4312,0.2435],[0.4336,0.2458],[0.4326,0.2471],[0.4351,0.2478],[0.4341,0.2491],[0.4351,0.2494],[0.4312,0.2521],[0.4253,0.2514],[0.4238,0.2521],[0.4224,0.2514],[0.418,0.2521],[0.4146,0.2498],[0.415,0.2484],[0.4131,0.2474],[0.4102,0.2425],[0.4087,0.2419],[0.4092,0.2405],[0.4028,0.2412],[0.4019,0.2422],[0.3994,0.2419],[0.3955,0.2396],[0.3955,0.2372],[0.3892,0.2376],[0.3901,0.2382],[0.3901,0.2412],[0.3867,0.2435],[0.3833,0.2432],[0.3779,0.2392],[0.3745,0.2346],[0.3726,0.2336],[0.3726,0.2323],[0.3687,0.2297],[0.3687,0.2284],[0.3652,0.2261],[0.3657,0.2251],[0.3599,0.2201],[0.3545,0.2136],[0.3481,0.2119],[0.3467,0.2126],[0.3408,0.2122],[0.3374,0.2099],[0.3359,0.207],[0.3267,0.1984],[0.3252,0.1951],[0.3223,0.1932],[0.3169,0.1941],[0.2993,0.2027],[0.2974,0.2027],[0.2935,0.205],[0.2915,0.205],[0.2881,0.2073],[0.2856,0.2073],[0.2817,0.2096],[0.2808,0.2116],[0.2793,0.2109],[0.2778,0.2119],[0.2778,0.2139],[0.2764,0.2139],[0.2729,0.2168],[0.2646,0.2267],[0.2622,0.2277],[0.2627,0.2287],[0.2578,0.232],[0.2588,0.2326],[0.2554,0.2346],[0.2476,0.2438],[0.2422,0.2478],[0.2412,0.2504],[0.2388,0.2511],[0.2388,0.2527],[0.2363,0.253],[0.2324,0.2507],[0.229,0.2501],[0.2266,0.2534],[0.2256,0.2534],[0.2178,0.2494],[0.2202,0.2471]]}],"N":[{"o":[[0.4834,0.1132],[0.4888,0.1168],[0.4907,0.1201],[0.4961,0.1244],[0.4976,0.1273],[0.5073,0.1356],[0.5093,0.1389],[0.5205,0.1487],[0.5317,0.1609],[0.5356,0.1635],[0.5371,0.1665],[0.5469,0.1747],[0.5483,0.1777],[0.5542,0.183],[0.5498,0.1862],[0.5449,0.1872],[0.5439,0.1882],[0.5415,0.1882],[0.5381,0.1909],[0.5356,0.1922],[0.5337,0.1922],[0.5288,0.1951],[0.5083,0.2116],[0.5083,0.2142],[0.5107,0.2188],[0.5107,0.2208],[0.5093,0.2221],[0.5122,0.2238],[0.5137,0.228],[0.5127,0.229],[0.5142,0.2297],[0.5146,0.234],[0.5156,0.2343],[0.5146,0.2356],[0.5161,0.2363],[0.521,0.2524],[0.5176,0.2547],[0.5044,0.2553],[0.501,0.253],[0.4985,0.2547],[0.4927,0.2781],[0.4902,0.279],[0.4917,0.2804],[0.4907,0.281],[0.4912,0.2843],[0.4897,0.2906],[0.4854,0.2942],[0.4761,0.2938],[0.4766,0.2975],[0.4839,0.2975],[0.4873,0.3001],[0.4819,0.3221],[0.4805,0.3244],[0.481,0.3258],[0.479,0.3268],[0.48,0.3274],[0.4795,0.3327],[0.4785,0.3333],[0.4771,0.3419],[0.4751,0.3429],[0.4751,0.3462],[0.4712,0.3468],[0.4717,0.3475],[0.4692,0.3495],[0.4683,0.3524],[0.4634,0.3524],[0.4609,0.3514],[0.4595,0.3524],[0.4507,0.3524],[0.4492,0.3498],[0.4468,0.3524],[0.4346,0.3524],[0.4341,0.3544],[0.4351,0.3551],[0.4399,0.3544],[0.4409,0.356],[0.4424,0.356],[0.4438,0.3544],[0.4473,0.3544],[0.4482,0.3564],[0.4502,0.3567],[0.4502,0.3603],[0.4482,0.361],[0.439,0.3606],[0.439,0.3616],[0.4365,0.3603],[0.4326,0.3606],[0.4326,0.3616],[0.4302,0.362],[0.4277,0.3613],[0.4282,0.3606],[0.4272,0.3606],[0.4268,0.3616],[0.4238,0.3616],[0.4238,0.3603],[0.4214,0.36],[0.4199,0.3616],[0.4165,0.3606],[0.4165,0.3616],[0.415,0.3616],[0.4141,0.3606],[0.4111,0.3606],[0.4106,0.3597],[0.4116,0.3544],[0.4263,0.3547],[0.4272,0.3524],[0.4243,0.3524],[0.4214,0.3508],[0.4204,0.3524],[0.4131,0.3524],[0.4116,0.3518],[0.4097,0.3524],[0.4072,0.3514],[0.4063,0.3524],[0.3926,0.3524],[0.3901,0.3508],[0.3901,0.3478],[0.3916,0.3465],[0.4209,0.3462],[0.4233,0.3475],[0.4243,0.3462],[0.4258,0.3462],[0.4277,0.3478],[0.4307,0.3442],[0.4341,0.3462],[0.4346,0.3445],[0.4365,0.3442],[0.438,0.3462],[0.4399,0.3465],[0.4438,0.3452],[0.4448,0.3462],[0.4473,0.3455],[0.4482,0.3472],[0.4492,0.3472],[0.4492,0.3462],[0.457,0.3462],[0.4595,0.3475],[0.4609,0.3455],[0.4395,0.3412],[0.4385,0.3435],[0.437,0.3442],[0.4355,0.3432],[0.436,0.3406],[0.4331,0.3432],[0.4316,0.3422],[0.4321,0.3396],[0.4302,0.3383],[0.4102,0.3323],[0.4038,0.3323],[0.3989,0.3291],[0.3931,0.3274],[0.394,0.3268],[0.3916,0.3254],[0.3911,0.3212],[0.3901,0.3208],[0.3911,0.3189],[0.3896,0.3185],[0.3896,0.3156],[0.3882,0.3162],[0.3872,0.3156],[0.3892,0.3149],[0.3877,0.3133],[0.3872,0.3073],[0.3848,0.3027],[0.3833,0.3027],[0.3833,0.3017],[0.3813,0.3011],[0.3818,0.3001],[0.3804,0.3001],[0.3804,0.2948],[0.376,0.2899],[0.3745,0.2866],[0.3745,0.282],[0.3711,0.2781],[0.3687,0.2777],[0.3682,0.2761],[0.3667,0.2754],[0.3662,0.2718],[0.3647,0.2711],[0.3628,0.2672],[0.3638,0.2659],[0.3618,0.2649],[0.3599,0.2609],[0.3584,0.2603],[0.3584,0.2593],[0.3618,0.257],[0.3687,0.257],[0.3687,0.2534],[0.3618,0.2534],[0.3618,0.2567],[0.3574,0.259],[0.3521,0.2547],[0.3511,0.2484],[0.3472,0.2498],[0.3447,0.2484],[0.3408,0.2484],[0.3311,0.2511],[0.3276,0.2504],[0.3218,0.2465],[0.3218,0.2455],[0.3159,0.2412],[0.3159,0.2402],[0.3037,0.2303],[0.3037,0.2294],[0.2974,0.2251],[0.2974,0.2241],[0.2935,0.2215],[0.2891,0.2165],[0.2852,0.2142],[0.2856,0.2136],[0.2832,0.2126],[0.2827,0.2103],[0.2939,0.2043],[0.2959,0.2043],[0.2998,0.202],[0.3042,0.2011],[0.3081,0.1984],[0.3101,0.1984],[0.314,0.1961],[0.3159,0.1961],[0.3169,0.1948],[0.3203,0.1935],[0.3257,0.1968],[0.3291,0.2007],[0.3291,0.202],[0.333,0.2047],[0.3345,0.2063],[0.334,0.2073],[0.3364,0.2083],[0.3389,0.2119],[0.3423,0.2126],[0.3491,0.2122],[0.355,0.2152],[0.3623,0.2234],[0.3643,0.2244],[0.3657,0.2274],[0.3716,0.232],[0.375,0.2376],[0.3784,0.2399],[0.3774,0.2409],[0.3809,0.2428],[0.3945,0.2442],[0.3979,0.2438],[0.3989,0.2428],[0.4058,0.2409],[0.4102,0.2438],[0.4102,0.2451],[0.4121,0.2461],[0.4111,0.2474],[0.4131,0.2478],[0.415,0.2514],[0.4175,0.2517],[0.418,0.2527],[0.4185,0.2521],[0.4224,0.2524],[0.4224,0.2517],[0.4248,0.2517],[0.4253,0.2524],[0.4253,0.2517],[0.4287,0.2517],[0.4321,0.2527],[0.4336,0.2514],[0.4365,0.2514],[0.436,0.2481],[0.4346,0.2474],[0.4355,0.2458],[0.4316,0.2432],[0.4351,0.2405],[0.437,0.2409],[0.4429,0.2376],[0.4448,0.2376],[0.4448,0.2386],[0.4458,0.2386],[0.4492,0.2356],[0.4517,0.2366],[0.4512,0.2356],[0.4551,0.234],[0.457,0.234],[0.458,0.233],[0.46,0.2333],[0.4614,0.232],[0.4639,0.2323],[0.4673,0.23],[0.4702,0.2303],[0.4746,0.2284],[0.4731,0.2254],[0.4683,0.2208],[0.4683,0.2172],[0.4727,0.2149],[0.4805,0.2063],[0.4956,0.1945],[0.4976,0.1912],[0.5015,0.1885],[0.5015,0.1839],[0.4995,0.1839],[0.4844,0.176],[0.48,0.1751],[0.4761,0.1724],[0.4688,0.1701],[0.4648,0.1675],[0.4521,0.1626],[0.4453,0.1586],[0.4409,0.1576],[0.437,0.155],[0.4355,0.155],[0.4336,0.153],[0.4336,0.15],[0.4365,0.1464],[0.4375,0.1464],[0.4404,0.1418],[0.4414,0.1418],[0.4409,0.1405],[0.4424,0.1405],[0.4463,0.1356],[0.4468,0.1333],[0.4453,0.1326],[0.4507,0.128],[0.4541,0.1231],[0.4595,0.1201],[0.4595,0.1171],[0.4644,0.1145],[0.4712,0.1145],[0.4717,0.1139],[0.4805,0.1132]]}],"O":[{"o":[[0.4756,0.3468],[0.4761,0.3435],[0.48,0.3274],[0.481,0.3274],[0.4805,0.3258],[0.4849,0.311],[0.4868,0.2991],[0.4878,0.2965],[0.4907,0.2942],[0.4907,0.2922],[0.4893,0.2915],[0.4897,0.2886],[0.4932,0.2856],[0.4976,0.2856],[0.4976,0.282],[0.4956,0.282],[0.4922,0.2797],[0.4922,0.2781],[0.4941,0.2761],[0.4937,0.2731],[0.4976,0.2577],[0.501,0.2553],[0.5039,0.257],[0.5063,0.255],[0.5195,0.2544],[0.5229,0.257],[0.5396,0.2577],[0.541,0.2583],[0.5435,0.2606],[0.5469,0.2985],[0.543,0.3008],[0.5332,0.2988],[0.5293,0.2988],[0.5264,0.2971],[0.5278,0.3139],[0.522,0.3152],[0.5215,0.3172],[0.5205,0.3172],[0.5205,0.3218],[0.5195,0.3212],[0.5176,0.3274],[0.5137,0.3291],[0.5117,0.3317],[0.5054,0.3343],[0.5034,0.3389],[0.4976,0.3406],[0.4922,0.3491],[0.4873,0.3491],[0.4766,0.3472]]}],"P":[{"o":[[0.5942,0.1803],[0.6372,0.2057],[0.6426,0.2096],[0.6445,0.2129],[0.6484,0.2152],[0.6484,0.2162],[0.6523,0.2188],[0.6538,0.2218],[0.6655,0.232],[0.6685,0.2366],[0.6699,0.2372],[0.6709,0.2409],[0.6753,0.2455],[0.6763,0.2491],[0.6821,0.2557],[0.6821,0.258],[0.6875,0.2639],[0.688,0.2679],[0.6895,0.2685],[0.6914,0.2787],[0.6929,0.2797],[0.6938,0.2859],[0.6963,0.2906],[0.6973,0.2971],[0.6982,0.2975],[0.7002,0.3047],[0.6968,0.307],[0.6929,0.308],[0.6855,0.3129],[0.6841,0.3205],[0.6812,0.3231],[0.6802,0.3264],[0.6802,0.331],[0.6792,0.3314],[0.6782,0.3379],[0.6772,0.3379],[0.6782,0.3389],[0.6772,0.3409],[0.6699,0.3465],[0.6709,0.3623],[0.6694,0.3639],[0.6694,0.3666],[0.6709,0.3672],[0.6709,0.3718],[0.6699,0.3728],[0.6714,0.3738],[0.6719,0.3807],[0.6699,0.387],[0.6772,0.3929],[0.6831,0.3959],[0.7002,0.4074],[0.7129,0.4179],[0.7183,0.4205],[0.7227,0.4212],[0.7329,0.4205],[0.7363,0.4228],[0.7373,0.4261],[0.7402,0.4288],[0.7412,0.4321],[0.7441,0.435],[0.7451,0.4383],[0.7466,0.439],[0.7466,0.4406],[0.7495,0.4432],[0.7505,0.4469],[0.7534,0.4495],[0.7554,0.4554],[0.7568,0.4561],[0.7568,0.4574],[0.7524,0.4597],[0.7349,0.461],[0.7344,0.4617],[0.7222,0.4627],[0.7217,0.4633],[0.7168,0.463],[0.7153,0.464],[0.7124,0.4636],[0.7114,0.4646],[0.709,0.4646],[0.707,0.4617],[0.6768,0.4449],[0.6758,0.4423],[0.6738,0.4429],[0.6709,0.4416],[0.6631,0.437],[0.6626,0.4357],[0.6611,0.4363],[0.6592,0.434],[0.6533,0.4317],[0.6543,0.4311],[0.6602,0.4064],[0.6543,0.4001],[0.6489,0.3975],[0.6426,0.3922],[0.6426,0.3909],[0.6387,0.3889],[0.6411,0.3797],[0.6406,0.3761],[0.6177,0.3646],[0.6143,0.3623],[0.6143,0.3613],[0.6099,0.359],[0.606,0.3544],[0.6021,0.3518],[0.6021,0.3504],[0.5986,0.3478],[0.5986,0.3468],[0.5869,0.337],[0.5757,0.3248],[0.5718,0.3221],[0.5718,0.3212],[0.5698,0.3202],[0.5669,0.3113],[0.5664,0.3044],[0.5674,0.3037],[0.5625,0.3047],[0.5562,0.3037],[0.5527,0.3024],[0.5498,0.3024],[0.5464,0.3001],[0.5454,0.281],[0.5444,0.28],[0.5454,0.2777],[0.5425,0.258],[0.5259,0.2573],[0.521,0.2537],[0.522,0.253],[0.521,0.253],[0.5195,0.2494],[0.5161,0.2386],[0.5156,0.2356],[0.5166,0.2349],[0.5151,0.2349],[0.5117,0.2238],[0.5127,0.2211],[0.5103,0.2188],[0.5112,0.2165],[0.5093,0.2155],[0.5083,0.2126],[0.5332,0.1928],[0.5347,0.1928],[0.5386,0.1905],[0.5405,0.1905],[0.542,0.1892],[0.5439,0.1892],[0.5474,0.1869],[0.5493,0.1869],[0.5532,0.1846],[0.5552,0.1846],[0.5591,0.1823],[0.561,0.1823],[0.5674,0.179]]}],"Q":[{"o":[[0.7158,0.3064],[0.7168,0.3073],[0.7305,0.3106],[0.7339,0.3129],[0.7339,0.3149],[0.7422,0.3149],[0.7427,0.3156],[0.7427,0.3149],[0.7451,0.3149],[0.7534,0.3182],[0.7612,0.3231],[0.7676,0.335],[0.7671,0.3363],[0.7695,0.3393],[0.772,0.3495],[0.771,0.3518],[0.7661,0.3547],[0.7651,0.3541],[0.7402,0.3537],[0.7349,0.3524],[0.7153,0.3429],[0.7134,0.3429],[0.7065,0.3396],[0.7012,0.3383],[0.6934,0.3383],[0.6924,0.3495],[0.6934,0.3524],[0.6885,0.3551],[0.6885,0.3583],[0.6938,0.3583],[0.6973,0.3606],[0.6982,0.3672],[0.6958,0.3771],[0.6958,0.3814],[0.6973,0.384],[0.6938,0.3863],[0.6919,0.3863],[0.6919,0.3899],[0.6992,0.3899],[0.7007,0.3886],[0.7021,0.3886],[0.707,0.3926],[0.7085,0.3965],[0.7119,0.3991],[0.7119,0.4005],[0.7188,0.4044],[0.7236,0.4057],[0.7461,0.408],[0.7495,0.41],[0.7476,0.4136],[0.7373,0.4202],[0.7319,0.4205],[0.7227,0.4212],[0.7153,0.4186],[0.708,0.413],[0.7061,0.4103],[0.6924,0.4018],[0.688,0.3978],[0.6797,0.3936],[0.6704,0.3866],[0.6719,0.3761],[0.6704,0.3725],[0.6709,0.3521],[0.6699,0.3481],[0.6777,0.3406],[0.6787,0.3333],[0.6802,0.3284],[0.6812,0.3281],[0.6802,0.3264],[0.6841,0.3205],[0.6851,0.3146],[0.6948,0.3077],[0.6992,0.3067],[0.7002,0.3057],[0.7061,0.305]]}],"R":[{"o":[[0.7012,0.3383],[0.708,0.3412],[0.71,0.3412],[0.7134,0.3435],[0.7153,0.3435],[0.7188,0.3458],[0.7207,0.3458],[0.7266,0.3495],[0.7285,0.3495],[0.7349,0.3527],[0.7432,0.3541],[0.7646,0.3541],[0.7681,0.3564],[0.7686,0.3597],[0.7715,0.3623],[0.7749,0.3699],[0.7744,0.3899],[0.7725,0.3922],[0.772,0.3962],[0.769,0.4021],[0.7612,0.4067],[0.7529,0.4084],[0.7461,0.4084],[0.7236,0.4057],[0.7188,0.4041],[0.7095,0.3968],[0.7065,0.3909],[0.6987,0.385],[0.6958,0.3814],[0.6982,0.3662],[0.6958,0.3544],[0.6929,0.3514],[0.6924,0.3412],[0.6963,0.3379]]}],"S":[{"o":[[0.7241,0.4656],[0.7236,0.4669],[0.7266,0.4696],[0.7231,0.4811],[0.7236,0.4896],[0.7266,0.4926],[0.728,0.4926],[0.7314,0.4949],[0.7314,0.4972],[0.7207,0.5064],[0.7163,0.5074],[0.7153,0.5064],[0.7124,0.5064],[0.7124,0.5074],[0.709,0.5097],[0.7056,0.5094],[0.7021,0.512],[0.6978,0.5114],[0.687,0.5196],[0.6826,0.5209],[0.6812,0.5222],[0.6768,0.5229],[0.6743,0.5248],[0.6694,0.5258],[0.6621,0.5301],[0.6577,0.5278],[0.6577,0.5252],[0.6533,0.5252],[0.6533,0.5288],[0.6572,0.5288],[0.6606,0.5311],[0.6606,0.5321],[0.6514,0.537],[0.6475,0.536],[0.6436,0.5337],[0.6416,0.5337],[0.6294,0.5278],[0.6274,0.5278],[0.625,0.5262],[0.6255,0.5252],[0.6509,0.5067],[0.6514,0.5054],[0.6563,0.5028],[0.6592,0.4995],[0.6548,0.4979],[0.6519,0.4979],[0.6519,0.4969],[0.6333,0.4969],[0.6313,0.4959],[0.6304,0.4969],[0.6211,0.4969],[0.6211,0.491],[0.6348,0.4906],[0.6274,0.4877],[0.623,0.489],[0.6211,0.4886],[0.6206,0.4877],[0.6182,0.4877],[0.6177,0.4886],[0.6094,0.489],[0.6084,0.4886],[0.6084,0.4854],[0.6069,0.485],[0.6079,0.4834],[0.6104,0.4827],[0.6108,0.4817],[0.6143,0.4824],[0.6152,0.4814],[0.6211,0.4827],[0.6211,0.4834],[0.625,0.4827],[0.6265,0.484],[0.6284,0.4827],[0.6304,0.4827],[0.6309,0.487],[0.6323,0.487],[0.6328,0.4827],[0.6357,0.4831],[0.6377,0.4854],[0.6401,0.4827],[0.6729,0.4831],[0.6719,0.4877],[0.6699,0.489],[0.665,0.4893],[0.665,0.4886],[0.6621,0.489],[0.6606,0.488],[0.6592,0.4886],[0.6523,0.488],[0.6519,0.4886],[0.6377,0.4886],[0.6421,0.491],[0.6499,0.491],[0.6509,0.4926],[0.6533,0.491],[0.6572,0.491],[0.6582,0.4926],[0.6606,0.4926],[0.6597,0.4969],[0.6626,0.4979],[0.6758,0.4873],[0.686,0.4808],[0.6899,0.4765],[0.6924,0.4755],[0.6953,0.4722],[0.6978,0.4712],[0.6978,0.4702],[0.6992,0.4702],[0.7017,0.4673],[0.7036,0.4666],[0.7036,0.4653],[0.7065,0.4656],[0.7075,0.4646],[0.7095,0.4646],[0.71,0.4653],[0.7114,0.4643],[0.7134,0.465],[0.7139,0.464],[0.7168,0.4643],[0.7168,0.4636],[0.7202,0.4633]]}],"T":[{"o":[[0.7568,0.46],[0.7603,0.4623],[0.7622,0.4656],[0.7715,0.4735],[0.7734,0.4768],[0.7798,0.4831],[0.7925,0.4817],[0.8003,0.4863],[0.8076,0.486],[0.8101,0.4867],[0.8413,0.5018],[0.8433,0.5018],[0.8496,0.5064],[0.8491,0.5094],[0.8423,0.5133],[0.8398,0.5133],[0.8403,0.5186],[0.8418,0.5192],[0.8418,0.5209],[0.832,0.5288],[0.8281,0.5337],[0.8232,0.537],[0.8203,0.5364],[0.8169,0.5383],[0.812,0.5462],[0.812,0.5482],[0.8096,0.5505],[0.8096,0.5525],[0.8071,0.5548],[0.8062,0.5587],[0.8037,0.561],[0.8037,0.563],[0.8022,0.5637],[0.8013,0.567],[0.7998,0.5676],[0.7979,0.5735],[0.7954,0.5758],[0.7954,0.5778],[0.793,0.5805],[0.791,0.586],[0.7896,0.5867],[0.7886,0.5903],[0.7852,0.5926],[0.7822,0.5926],[0.7813,0.5916],[0.7793,0.5913],[0.772,0.5864],[0.7686,0.5768],[0.7666,0.5768],[0.7573,0.5719],[0.7524,0.5709],[0.7427,0.5663],[0.7407,0.5663],[0.7285,0.5604],[0.7261,0.5604],[0.7227,0.5581],[0.7227,0.5568],[0.7188,0.5531],[0.7173,0.5538],[0.7139,0.5515],[0.7114,0.5515],[0.7075,0.5492],[0.7056,0.5492],[0.7021,0.5469],[0.6997,0.5469],[0.6963,0.5446],[0.6914,0.5433],[0.6875,0.541],[0.6855,0.541],[0.6841,0.5397],[0.6763,0.5393],[0.666,0.542],[0.6616,0.542],[0.6553,0.5387],[0.6543,0.537],[0.666,0.5288],[0.6675,0.5288],[0.6719,0.5258],[0.6738,0.5258],[0.6777,0.5232],[0.6826,0.5219],[0.6904,0.5173],[0.6919,0.5173],[0.6958,0.5143],[0.7017,0.513],[0.7051,0.5104],[0.708,0.5104],[0.7114,0.5127],[0.7109,0.5137],[0.7144,0.514],[0.7153,0.5137],[0.7153,0.509],[0.7192,0.5067],[0.7251,0.5061],[0.7256,0.5028],[0.729,0.5008],[0.729,0.4995],[0.7324,0.4969],[0.7324,0.4939],[0.729,0.4929],[0.7236,0.4893],[0.7231,0.4811],[0.7241,0.4771],[0.728,0.4742],[0.7314,0.4765],[0.7314,0.4778],[0.7354,0.4778],[0.7358,0.4732],[0.7393,0.4709],[0.7432,0.4709],[0.7432,0.4673],[0.7393,0.4673],[0.7358,0.465],[0.7358,0.463],[0.7393,0.4607],[0.7534,0.4594]]}],"U":[{"o":[[0.6001,0.5999],[0.6011,0.5989],[0.6011,0.5933],[0.5962,0.5933],[0.5962,0.5949],[0.5923,0.5972],[0.5825,0.5926],[0.5806,0.5926],[0.5703,0.5867],[0.5703,0.5857],[0.5664,0.5831],[0.5649,0.5801],[0.563,0.5791],[0.5625,0.5772],[0.5649,0.5762],[0.5664,0.5739],[0.5962,0.5485],[0.5967,0.5466],[0.5977,0.5466],[0.5991,0.5443],[0.6133,0.5344],[0.6157,0.5314],[0.6172,0.5314],[0.6201,0.5295],[0.6201,0.5285],[0.6211,0.5288],[0.6235,0.5262],[0.6421,0.5344],[0.644,0.5344],[0.6479,0.5367],[0.6499,0.5367],[0.6587,0.5416],[0.6606,0.5416],[0.6641,0.5439],[0.666,0.5508],[0.6592,0.5564],[0.6553,0.5541],[0.6553,0.5525],[0.6504,0.5525],[0.6504,0.5551],[0.6489,0.5561],[0.6533,0.5561],[0.6567,0.5584],[0.6567,0.5597],[0.6528,0.5627],[0.6514,0.5653],[0.6475,0.5679],[0.6475,0.5693],[0.6377,0.5775],[0.6362,0.5805],[0.6304,0.5847],[0.6304,0.586],[0.626,0.589],[0.6265,0.5897],[0.6226,0.5933],[0.6172,0.5966],[0.6099,0.5966],[0.6099,0.6002],[0.6064,0.6025],[0.6025,0.6015]]}],"V":[{"o":[[0.4316,0.6265],[0.4365,0.6222],[0.4424,0.6226],[0.4434,0.6236],[0.4458,0.6226],[0.4458,0.618],[0.4473,0.617],[0.4526,0.6173],[0.4521,0.6163],[0.4531,0.616],[0.4531,0.6176],[0.4546,0.617],[0.4556,0.618],[0.458,0.618],[0.4575,0.6167],[0.4585,0.6163],[0.4595,0.6173],[0.4585,0.618],[0.4614,0.6183],[0.4932,0.6193],[0.5024,0.617],[0.5034,0.615],[0.5039,0.616],[0.5054,0.616],[0.5063,0.6143],[0.5083,0.615],[0.5107,0.6137],[0.5112,0.6143],[0.5127,0.613],[0.5176,0.612],[0.5186,0.6111],[0.5205,0.6114],[0.5215,0.6101],[0.5239,0.6104],[0.5269,0.6094],[0.5352,0.6028],[0.5356,0.6015],[0.5347,0.6012],[0.5376,0.6005],[0.5449,0.5939],[0.5449,0.593],[0.5459,0.5933],[0.5474,0.592],[0.5459,0.591],[0.5493,0.59],[0.5498,0.5887],[0.5547,0.5854],[0.5547,0.5844],[0.5562,0.5841],[0.5566,0.5828],[0.5557,0.5824],[0.5571,0.5818],[0.5576,0.5824],[0.5591,0.5814],[0.5581,0.5808],[0.5601,0.5805],[0.561,0.5791],[0.5654,0.5814],[0.5654,0.5828],[0.5732,0.59],[0.583,0.5933],[0.5869,0.5962],[0.5884,0.5956],[0.5952,0.5992],[0.5972,0.5992],[0.6011,0.6018],[0.6055,0.6025],[0.6143,0.6022],[0.6182,0.5989],[0.6201,0.5956],[0.626,0.591],[0.626,0.59],[0.6333,0.5841],[0.6333,0.5828],[0.6372,0.5798],[0.6372,0.5788],[0.645,0.5726],[0.6465,0.5696],[0.6504,0.5673],[0.6523,0.564],[0.6621,0.5558],[0.6636,0.5528],[0.6655,0.5518],[0.666,0.5482],[0.6636,0.5436],[0.667,0.5413],[0.6782,0.5393],[0.6826,0.5397],[0.6865,0.542],[0.6909,0.5429],[0.6978,0.5466],[0.6992,0.5466],[0.7012,0.5482],[0.7021,0.5479],[0.7061,0.5499],[0.708,0.5499],[0.7124,0.5535],[0.7168,0.5538],[0.7173,0.5551],[0.7188,0.5545],[0.7261,0.5604],[0.7383,0.5656],[0.7402,0.5656],[0.7471,0.5693],[0.752,0.5703],[0.7588,0.5749],[0.7632,0.5752],[0.7646,0.5765],[0.7661,0.5765],[0.77,0.5795],[0.772,0.588],[0.7803,0.5923],[0.7817,0.5923],[0.7866,0.5959],[0.7866,0.5979],[0.7891,0.6002],[0.7891,0.6015],[0.7925,0.6041],[0.7983,0.6134],[0.7998,0.614],[0.8013,0.6176],[0.8062,0.6222],[0.8076,0.6245],[0.8062,0.6252],[0.8062,0.6265],[0.8042,0.6275],[0.8013,0.6324],[0.7964,0.6371],[0.7964,0.6384],[0.7896,0.6449],[0.7881,0.6482],[0.7861,0.6492],[0.7832,0.6542],[0.7817,0.6548],[0.7817,0.6561],[0.7769,0.6607],[0.7769,0.6621],[0.7749,0.663],[0.7734,0.666],[0.7686,0.6706],[0.7686,0.6719],[0.7651,0.6746],[0.7637,0.6779],[0.7583,0.6811],[0.7559,0.6811],[0.752,0.6834],[0.7466,0.6841],[0.7427,0.6861],[0.7378,0.6867],[0.7368,0.6877],[0.7344,0.6877],[0.7305,0.6897],[0.7251,0.6904],[0.7183,0.6933],[0.7129,0.694],[0.7061,0.6969],[0.7036,0.6969],[0.7002,0.6989],[0.6948,0.6999],[0.6938,0.7009],[0.6851,0.6996],[0.6641,0.6983],[0.6631,0.6992],[0.6572,0.6996],[0.6563,0.7006],[0.6533,0.7006],[0.6528,0.7012],[0.6509,0.7009],[0.6499,0.7019],[0.6445,0.7025],[0.6436,0.7035],[0.6406,0.7035],[0.6401,0.7042],[0.6382,0.7042],[0.6343,0.7009],[0.6299,0.6996],[0.6265,0.6973],[0.6245,0.6973],[0.604,0.6867],[0.5996,0.6854],[0.5962,0.6828],[0.5942,0.6828],[0.5903,0.6802],[0.583,0.6779],[0.5801,0.6759],[0.5786,0.668],[0.5747,0.6654],[0.5747,0.6644],[0.5337,0.6407],[0.5225,0.639],[0.4541,0.6341],[0.4434,0.6338],[0.4414,0.6347],[0.4331,0.6288]]}],"W":[{"o":[[0.2534,0.7055],[0.251,0.7009],[0.249,0.6999],[0.248,0.6953],[0.2495,0.692],[0.2549,0.6887],[0.2568,0.6887],[0.2632,0.6854],[0.269,0.6841],[0.2715,0.6844],[0.272,0.6834],[0.2729,0.6834],[0.2729,0.6844],[0.2773,0.6841],[0.2783,0.6825],[0.2803,0.6834],[0.2813,0.6818],[0.2837,0.6821],[0.2847,0.6808],[0.2866,0.6811],[0.2871,0.6798],[0.2891,0.6805],[0.29,0.6788],[0.2915,0.6795],[0.292,0.6785],[0.2925,0.6792],[0.3008,0.6749],[0.3008,0.6732],[0.2969,0.6713],[0.2954,0.6719],[0.2915,0.6683],[0.2964,0.6654],[0.293,0.6634],[0.292,0.6637],[0.2915,0.6624],[0.2896,0.6624],[0.29,0.6611],[0.2871,0.6607],[0.2827,0.6581],[0.2842,0.6555],[0.2837,0.6522],[0.2852,0.6512],[0.2876,0.6512],[0.2876,0.6489],[0.2896,0.6476],[0.293,0.6482],[0.2979,0.6456],[0.2983,0.641],[0.2969,0.6344],[0.2993,0.6331],[0.2993,0.6321],[0.3013,0.6328],[0.3018,0.6318],[0.3037,0.6318],[0.3037,0.6328],[0.3062,0.6331],[0.3066,0.6324],[0.311,0.6321],[0.311,0.6315],[0.3125,0.6318],[0.3145,0.6305],[0.3145,0.6292],[0.3159,0.6288],[0.3159,0.6298],[0.3184,0.6298],[0.3223,0.6282],[0.3232,0.6269],[0.3257,0.6265],[0.3281,0.6232],[0.3364,0.6209],[0.3364,0.6203],[0.3369,0.6209],[0.3408,0.6209],[0.3408,0.6196],[0.3447,0.6226],[0.3496,0.6239],[0.3496,0.6282],[0.3555,0.6282],[0.3555,0.6245],[0.3521,0.6226],[0.356,0.6196],[0.3579,0.6193],[0.3574,0.6183],[0.3594,0.6186],[0.3633,0.6167],[0.3657,0.6143],[0.3652,0.6104],[0.3662,0.6107],[0.3682,0.6091],[0.3706,0.6088],[0.3765,0.6107],[0.3779,0.6104],[0.4004,0.6157],[0.4048,0.6143],[0.4072,0.6147],[0.4155,0.6134],[0.4219,0.6147],[0.4365,0.6157],[0.4385,0.6167],[0.4385,0.6176],[0.4355,0.6222],[0.4307,0.6269],[0.4307,0.6295],[0.4331,0.6315],[0.436,0.6321],[0.4355,0.6328],[0.4375,0.6328],[0.4429,0.6367],[0.4414,0.6397],[0.3745,0.6917],[0.3716,0.7025],[0.3716,0.7081],[0.373,0.7088],[0.374,0.7121],[0.3755,0.7127],[0.3765,0.7167],[0.3789,0.7193],[0.3799,0.7229],[0.3813,0.7236],[0.3857,0.7335],[0.3872,0.7341],[0.3901,0.742],[0.3916,0.7427],[0.3916,0.744],[0.3882,0.7463],[0.3867,0.746],[0.3799,0.7512],[0.3706,0.7512],[0.3486,0.7483],[0.3398,0.7463],[0.3364,0.7447],[0.334,0.7447],[0.333,0.7437],[0.3276,0.7433],[0.3188,0.741],[0.3125,0.7377],[0.3022,0.7348],[0.2959,0.7312],[0.2939,0.7312],[0.2842,0.7259],[0.2563,0.7075]]}],"X":[{"o":[[0.375,0.6917],[0.3916,0.6792],[0.3936,0.6792],[0.3945,0.6802],[0.4014,0.6802],[0.4014,0.6756],[0.3989,0.6742],[0.3989,0.6729],[0.4233,0.6551],[0.4253,0.6525],[0.4341,0.6466],[0.4341,0.6456],[0.439,0.643],[0.4434,0.6361],[0.4468,0.6338],[0.4482,0.6338],[0.4917,0.6367],[0.4956,0.639],[0.4956,0.6433],[0.5,0.6433],[0.5,0.64],[0.5029,0.638],[0.5225,0.639],[0.5317,0.6403],[0.5581,0.6555],[0.5581,0.6565],[0.5552,0.6581],[0.5552,0.6621],[0.5596,0.6621],[0.5625,0.6594],[0.5649,0.6591],[0.5757,0.666],[0.5757,0.667],[0.5791,0.6693],[0.5801,0.6762],[0.5879,0.6798],[0.5938,0.6844],[0.5962,0.6838],[0.6113,0.6917],[0.6182,0.694],[0.625,0.6979],[0.6318,0.7006],[0.6353,0.7029],[0.6323,0.7048],[0.6274,0.7071],[0.6064,0.7111],[0.6045,0.7127],[0.6035,0.7298],[0.605,0.7305],[0.6079,0.7354],[0.6099,0.7364],[0.6108,0.7387],[0.605,0.7637],[0.5996,0.7683],[0.5996,0.7693],[0.5786,0.7851],[0.5698,0.7864],[0.5674,0.7858],[0.5664,0.7868],[0.5601,0.7874],[0.5493,0.7878],[0.5454,0.7858],[0.54,0.7848],[0.5391,0.7838],[0.5215,0.7799],[0.5171,0.7762],[0.5146,0.7677],[0.5107,0.7611],[0.5117,0.7598],[0.5078,0.7572],[0.5083,0.7562],[0.5054,0.7565],[0.4985,0.7529],[0.4932,0.7522],[0.4893,0.7502],[0.4839,0.7499],[0.4829,0.7489],[0.4805,0.7489],[0.4795,0.7476],[0.4771,0.7483],[0.4766,0.7476],[0.4678,0.7466],[0.4663,0.7456],[0.4644,0.746],[0.4575,0.7443],[0.4512,0.744],[0.4507,0.7433],[0.4409,0.7427],[0.4404,0.742],[0.4126,0.741],[0.4023,0.742],[0.3984,0.7433],[0.3965,0.743],[0.395,0.744],[0.3916,0.7417],[0.3916,0.7397],[0.3887,0.7381],[0.3809,0.7219],[0.3794,0.7213],[0.375,0.7114],[0.3735,0.7108],[0.3735,0.7091],[0.3716,0.7071],[0.3721,0.7012]]}]};
