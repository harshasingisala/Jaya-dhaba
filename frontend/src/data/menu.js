export const languageMap = {
  en: { home: "Home", menu: "Menu", reservation: "Reservation", track: "Track Order", exploreMenu: "Explore Menu", bookTable: "Book Table", add: "Add", checkout: "Checkout", reserve: "Reserve Table", proceed: "Proceed to Checkout", chatbot: "Ask Jaya", favorites: "Favorites", theme: "Theme", lang: "Telugu", voice: "Voice", combo: "Build Combo" },
  te: { home: "హోమ్", menu: "మెను", reservation: "రిజర్వేషన్", track: "ఆర్డర్ ట్రాక్", exploreMenu: "మెను చూడండి", bookTable: "టేబుల్ బుక్", add: "జోడించు", checkout: "చెకౌట్", reserve: "టేబుల్ బుక్ చేయి", proceed: "చెకౌట్కు వెళ్ళు", chatbot: "జయాను అడుగు", favorites: "ఫేవరెట్స్", theme: "థీమ్", lang: "English", voice: "వాయిస్", combo: "కాంబో" }
};
export const menuItems = [
  { id: "biryani", name: "Chicken Biryani", desc: "Slow-cooked dum biryani with saffron rice.", price: 299, rating: 4.9, category: "biryani", img: "/biryani.png", tags: ["best-seller", "spicy"] },
  { id: "haleem", name: "Hyderabadi Haleem", desc: "Slow-cooked heritage meat stew with wheat and lentils.", price: 349, rating: 5.0, category: "biryani", img: "/haleem.png", tags: ["seasonal", "heritage"] },
  { id: "kofta", name: "Malai Kofta - Golden Heritage", desc: "Silky cashew gravy with cottage cheese melt-in-the-mouth balls.", price: 329, rating: 4.8, category: "veg", img: "/kofta.png", tags: ["premium", "veg"] },
  { id: "paneer", name: "Paneer Tikka", desc: "Charcoal-grilled paneer with herbs.", price: 249, rating: 4.7, category: "veg", img: "/paneer.png", tags: ["veg"] },
  { id: "tandoori", name: "Tandoori Chicken", desc: "Clay oven roasted chicken with rich spices.", price: 349, rating: 4.8, category: "grill", img: "/chicken.png", tags: ["non-veg", "grill"] },
  { id: "naan", name: "Butter Naan", desc: "Soft, buttery naan.", price: 59, rating: 4.6, category: "bread", img: "/naan.png", tags: ["bread"] },
  { id: "mutton", name: "Mutton Rogan Josh", desc: "Rich Kashmiri gravy with slow-cooked mutton.", price: 429, rating: 4.8, category: "biryani", img: "/mutton.png", tags: ["premium", "spicy"] },
  { id: "kheer", name: "Jaya Special Kheer", desc: "Traditional rice pudding flavored with saffron and cardamom.", price: 129, rating: 4.7, category: "drinks", img: "/kheer.png", tags: ["dessert"] },
  { id: "double", name: "Special Double Ka Meetha", desc: "Fried bread dessert soaked in mawa and saffron milk.", price: 149, rating: 4.9, category: "drinks", img: "/double.png", tags: ["dessert", "premium"] },
  { id: "lassi", name: "Rose Lassi", desc: "Cooling yogurt drink with rose petals.", price: 89, rating: 4.5, category: "drinks", img: "/lassi.png", tags: ["drink"] },
  { id: "manchurian", name: "Veg Manchurian Dry", desc: "Crispy veg balls in spicy soy-garlic glaze.", price: 249, rating: 4.7, category: "veg", img: "/kofta.png", tags: ["veg", "oriental"] },
  { id: "chicken65", name: "Chicken 65", desc: "Spicy, deep-fried chicken tempered with curry leaves.", price: 299, rating: 4.9, category: "grill", img: "/chicken.png", tags: ["non-veg", "spicy"] }
];
export const orderStatuses = ["Placed", "Preparing", "Ready", "Served"];
