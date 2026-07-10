var CONFIG = {
    map: {
        center: [24.7136, 46.6753],
        zoom: 10
    },

    files: {
        facilities: "data/facilities.json"
    },

    supabase: {
        url: "https://g7zrdvjpzxaslvqbxloa.supabase.co",
        anonKey: "sb_publishable__BNgnqWS29yU0Ks4nEUOxQ_ZK_KMQhz"
    },

    app: {
        version: "0.5-alpha"
    }
};

window.CONFIG = CONFIG;

console.log("Loaded CONFIG");
