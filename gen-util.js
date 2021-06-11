const fs = require("fs");


const write_json = (file, obj) => {
    fs.writeFileSync(file, JSON.stringify(obj,null," "));
    return file;
}

// random number generator
function sfc32(a, b, c, d) {
    const r = function() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
        var t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
    for(var i = 0; i < 100; i++){
        r();
    }
    return r;
}

var module_rng = sfc32(101,102,10,11);

function set_seed(a,b,c,d){
    module_rng = sfc32(a,b,c,d);
}

function next_float(){
    return module_rng();
}

function next_int(low, high){
    return low + Math.floor(next_float()*(high-low));
}

function draw_sans_replacement(set, n){
    if(set.length < n){
        throw new Error("draw_sans_replacement can't draw from a set smaller than the desired number of items.");
    }
    const n_max = set.length;
    var seen = {};
    var n_found = 0;
    const out = [];
    while(n_found < n){
        var i = next_int(0, n_max);
        if(!seen[i]){
            seen[i] = true;
            out.push(set[i]);
            n_found = n_found + 1;
        }
    }
    return out;
}

function draw_with_replacement(set, n){
    var max_n = set.length;
    return seq(n,i => set[next_int(0,max_n)]);
}

const seq = (n, f = (i)=>i) => {
    const out = [];
    for(var i = 0; i < n; i++){
        out.push(f(i));
    }
    return out;
}

module.exports = {
    write_json:write_json,
    sfc32:sfc32,
    draw_sans_replacement:draw_sans_replacement,
    draw_with_replacement:draw_with_replacement,
    seq:seq,
    set_seed:set_seed,
    next_float:next_float,
    next_int:next_int
}
