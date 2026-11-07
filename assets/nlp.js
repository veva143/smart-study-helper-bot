// Small NLP engine: tokenizer, stop words, TF-IDF, cosine similarity, spelling correction (edit distance)
var NLP=(function(){
 var STOP="a an the is are was were be of to in on for and or with what why how does do did explain define tell me about give short note notes please can you my i it this that as by from at which when who whom".split(" ");
 function stem(w){return w.length>4?w.replace(/(ing|ed|es|s)$/,""):w}
 function tok(t){return(t.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(function(w){return STOP.indexOf(w)<0}).map(stem)}
 var docs=[],df={},vocab={};
 DATA.forEach(function(S,si){S.topics.forEach(function(T,ti){var nm=T.name.replace(/^U\d\s/,""),d=DEEP&&DEEP[T.name];
  var txt=(nm+" ").repeat(3)+(T.keywords+" ").repeat(2)+S.subject+" "+T.notes.join(" ")+" "+T.questions.join(" ")+(d?" "+d.def+" "+d.explain.join(" "):"");
  var tf={};tok(txt).forEach(function(w){tf[w]=(tf[w]||0)+1;vocab[w]=1});docs.push({si:si,ti:ti,tf:tf});Object.keys(tf).forEach(function(w){df[w]=(df[w]||0)+1})})});
 var nameTok={};DATA.forEach(function(S,si){S.topics.forEach(function(T,ti){nameTok[si+"-"+ti]=tok(T.name.replace(/^U\d\s/,""))})});
 var N=docs.length;function idf(w){return Math.log((N+1)/((df[w]||0)+1))+1}
 docs.forEach(function(d){var s=0;for(var w in d.tf){d.tf[w]=(1+Math.log(d.tf[w]))*idf(w);s+=d.tf[w]*d.tf[w]}d.n=Math.sqrt(s)});
 function lev(a,b){var m=[],i,j;for(i=0;i<=a.length;i++)m[i]=[i];for(j=0;j<=b.length;j++)m[0][j]=j;for(i=1;i<=a.length;i++)for(j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length]}
 function fix(w){if(vocab[w]||w.length<5)return w;var best=w,bs=99;for(var v in vocab){if(Math.abs(v.length-w.length)>2)continue;var d=lev(w,v);if(d>2)continue;var p=0;while(p<v.length&&p<w.length&&v[p]===w[p])p++;if(p<3)continue;var sc=d*10-p;if(sc<bs){bs=sc;best=v}}return best}
 function search(q,k){var raw=tok(q),t=raw.map(fix),changed=t.join(" ")!==raw.join(" "),qv={},qn=0;
  t.forEach(function(w){qv[w]=(qv[w]||0)+1});for(var w in qv){qv[w]*=idf(w);qn+=qv[w]*qv[w]}qn=Math.sqrt(qn)||1;
  var r=docs.map(function(d){var dot=0;for(var w in qv)if(d.tf[w])dot+=qv[w]*d.tf[w];var nm=nameTok[d.si+"-"+d.ti],ov=t.filter(function(x){return nm.indexOf(x)>-1}).length;return{si:d.si,ti:d.ti,score:dot/(qn*d.n)+(ov?0.25*ov/nm.length+0.25*ov/t.length:0)}}).filter(function(x){return x.score>0.12}).sort(function(a,b){return b.score-a.score});
  return{results:r.slice(0,k||5),corrected:changed?t.join(" "):""}}
 return{search:search,tok:tok}})();
