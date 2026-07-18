var CONFIG = {
    map: {
        center: [24.7136, 46.6753],
        zoom: 10
    },

    files: {
        facilities: "data/facilities.json"
    },

    supabase: {
    url: "https://gzrdvjpzxaslvqbxloal.supabase.co",
    anonKey: "sb_publishable__BNgnqWS29yU0Ks4nEUOxQ_ZK_KMQhz"
},

    app: {
    version: "v0.9.31"
}
};

window.CONFIG = CONFIG;

console.log("Loaded CONFIG");
