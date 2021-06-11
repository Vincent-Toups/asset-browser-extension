// * Asset Browser meta-data search reference implementation
// ** Data Set
//   Our first job is to define a mock-database of meta-data. Let's build
//   a data base of 100 meta-data entries.
//   #+begin_src js :session "*Javascript REPL*"

const fs = require("fs");
const source_data = require("./source-data");
const util = require("./gen-util");
const generate_n = 1000;

const out = util.seq(generate_n, i => {
    const out = {};
    const cols = util.draw_sans_replacement(source_data.column,2);
    out.cols = cols;
    cols.forEach(col => {
        const ss = util.draw_sans_replacement(source_data[col],10);
        out[col] = util.draw_with_replacement(ss,10);
    });
    return out;
});

util.write_json("./database.json",out);
console.log("An Example:")
console.log(out[0]);

// ** Parser
//    Let's now write a parser for our thing. First we'll tokenize the data.
//    #+begin_src js :session "*Javascript REPL*"

function Spaces(){
    this.done = false;
}

Spaces.prototype.accept = function(c){
    if (c === ' ' || c === '	'){
        return true;
    } else {
        this.done = true;
        return false;
    };
}

function String(){
    this.escape = false;
    this.acc = [];
    this.done = false;
}

String.prototype.accept = function(c){
    if(this.acc.length !== 0 && !this.escape && c === '"'){           
        this.done = true;
        this.acc = this.acc.join("");
        return true;
    } else if (this.escape && c === '"'){
        this.acc.push(c);
        this.escape = false;
        return true;
    } else if (this.escape && c !== '"'){
        throw new Error("Only a \" can follow a backslash. Instead we got a `"+c+"`.");
    } else if (!this.escape && c === '\\'){
        this.escape = true;
        return true;             
    } else if (this.acc.length === 0 && c === '"') {
        return true;
    } else {
        this.acc.push(c);
        return true;
    }
}

function Symbol(){
    this.acc = [];
    this.done = false;
}

Symbol.prototype.accept = function(c){
    if(c === ' ' || c === '	'){
        this.done = true;
        this.acc = this.acc.join("");
        return true;
    } else {
        this.acc.push(c);
        return true;
    }         
}

function character_to_acc(c){
    if(c === ' ' || c === '	'){
        return new Spaces();
    } else if (c === '"'){
        return new String();
    } else {
        const out = new Symbol();
        return out;
    }
}

const last = (lst) => lst[lst.length-1];

const tokenize_string = (s, lexeme_ended) => {
    var acc = null;
    var tokens = [];         
    Array
        .prototype
        .slice
        .call(s + " ") //put a space at the end to make the last lexeme an empty one
        .forEach(element => {
            if(acc === null){
                acc = character_to_acc(element);
            }
            acc.accept(element)
            if(acc.done){
                if(!(acc instanceof Spaces)){
                    tokens.push(acc);
                }
                acc = null;
            }
        });
    return tokens;
}

console.log(tokenize_string('s hello "a string"'));
console.log(tokenize_string('s hello "a \\" string"'));
//    #+end_src

//    #+RESULTS:
//    : function Spaces(){

// Now we need to parse a term. Recall from the specification that a term
// is just a form like this:

// #+begin_src
// <symbol> :has <symbol|string> [<logical0> <symbol0|string0> ...]
// #+end_src

// We need a few more utilities:

// #+begin_src js :session ref-imp
// the ending `p` indicates `predicate`
const symbolp = (token) => token instanceof Symbol;
const hasp = (token) =>
      symbolp(token) && (token.acc === ':has')
const logicalp = (token) =>
      symbolp(token) && (token.acc === ':and' || token.acc === ':or');
const stringp = (token) => (token instanceof String);
const string_or_symbolp = (token) => stringp(token) || symbolp(token);
// #+end_src

// A parser will simply be a function that accepts a list of tokens and
// returns either `false` to indicate it can't parse that token or list
// with two elements - the parsed object and the rest of the list to be
// parsed.

// Let's do a warm up:

// #+begin_src js

const metadata_column_has = (column,value) => {
    const out=function(metadata){
        return metadata[column] && metadata[column].indexOf(value) !== -1;
    }
    out.toString = function(){
        return "<" + column + " :has " + value + ">";
    }
    out.column = column;
    out.value = value;
    return out;
}

function f_and(){
    var fs = Array.prototype.slice.call(arguments,0,arguments.length);
    const n = fs.length;
    var out = function(){
        const inner_args = Array.prototype.slice.call(arguments, 0, arguments.length);
        var b = true;
        var i = 0;
        while(i < n && b){
            b = fs[i].apply({},inner_args);
            i = i + 1;
        }
        return b;
    }
    out.toString = function(){
        return ["<f_and: ", fs.map(f => f.toString()).join(", "), " >"].join("");
    }
    return out;
}

function f_or(){
    var fs = Array.prototype.slice.call(arguments,0,arguments.length);
    const n = fs.length;
    var out = function(){
        const inner_args = Array.prototype.slice.call(arguments, 0, arguments.length);
        var b = false;
        var i = 0;
        while(i < n){
            b = b || fs[i].apply({},inner_args);
            if(b) break;
            i = i + 1;
        }
        return b;
    }
    out.toString = function(){
        return ["<f_or: ", fs.map(f => f.toString()).join(", "), " >"].join("");
    }
    return out;
}


const parse_simple_term = (tokens) => {
    if(symbolp(tokens[0]) &&
       hasp(tokens[1]) &&
       string_or_symbolp(tokens[2])){
        return [metadata_column_has(tokens[0].acc, tokens[2].acc), tokens.slice(3)];
    } else {
        return false;
    }
}

(()=>{
    const example_tokens = tokenize_string(`column :has fruit`);
    console.log(parse_simple_term(example_tokens).toString())
})()

/*

Now let's actually parse a term, which includes trailing connectives.

*/

const parse_term_extension = (tokens) => {
    if(logicalp(tokens[0]) &&
       string_or_symbolp[1]) {
        return [[tokens[0].acc, tokens[1].acc], tokens.slice(2)];
    } else {
        return false;
    }
}

const parse_repeatedly = (parser) => (tokens) => {
    let out = [];
    let done = false;
    let rest_tokens = tokens;
    while(!done){
        let v = parser(rest_tokens);
        if(v){
            out.push(v[0]);
            rest_tokens = v[1];
        } else {
            done = true;
        }
    }
    return [out,rest_tokens];
}

const parse_zero_or_more_term_extensions = parse_repeatedly(parse_term_extension);

const parse_term = (tokens) => {
    const simple_part = parse_simple_term(tokens);
    if(!simple_part) return false;
    const rest_tokens = simple_part[1];
    const extensions = parse_zero_or_more_term_extensions(rest_tokens);
    if(!extensions) return simple_part;
    let test_func = simple_part[0];
    let column = test_func.column;
    const ex_rest_tokens = extensions[1];
    extensions[0].forEach(extension => {
        const l = extension[0];
        const s = extension[1];
        const f = metadata_column_has(test_func.column,s);
        if(l===':or'){
            test_func = f_or(test_func, f);
        } else if (l===":and") {
            test_func = f_and(test_func, f);
        } else {
            throw new Error("Unrecognized connective.");
        }
    });
    return [test_func, ex_rest_tokens];
}

(()=>{
    const example_tokens = tokenize_string(`column :has fruit :or spice`);
    console.log(parse_term(example_tokens)[0].toString())
})()
