// Quiz engine: builds a big pool from the data and picks fresh random questions every time
var Quiz=(function(){
 function sh(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
 function ttl(t){return t.name.replace(/^U\d\s/,"")}
 function others(arr,not,n){return sh(arr.filter(function(x){return x!==not})).slice(0,n)}
 function seen(){try{return JSON.parse(localStorage.getItem("seenQ")||"[]")}catch(e){return[]}}
 function mark(list){try{localStorage.setItem("seenQ",JSON.stringify(seen().concat(list).slice(-700)))}catch(e){}}
 function item(q,right,wrong,si,ti,type){var o=sh([right].concat(wrong));return{question:q,options:o,answer:o.indexOf(right),si:si,ti:ti,type:type}}
 function pool(si,ti){var S=DATA[si],T=S.topics[ti],out=[],names=S.topics.map(ttl),notes=[],qs=[];
  S.topics.forEach(function(t,j){if(j!==ti){t.notes.forEach(function(n){notes.push(n)});t.questions.forEach(function(x){qs.push(x)})}});
  T.quiz.forEach(function(z){out.push({question:z.question,options:z.options,answer:z.answer,si:si,ti:ti,type:"core"})});
  T.notes.forEach(function(n){if(n.length<25)return;
   out.push(item("Which topic does this statement describe?  \u201c"+n+"\u201d",ttl(T),others(names,ttl(T),3),si,ti,"topic"));
   out.push(item("Which statement is true about "+ttl(T)+"?",n,others(notes,n,3),si,ti,"stmt"))});
  T.questions.forEach(function(x){out.push(item("Which of these is an important exam question on "+ttl(T)+"?",x,others(qs,x,3),si,ti,"exam"))});
  return out}
 function pick(sc,n){var all=[],tops=[];
  DATA.forEach(function(S,i){if(sc.si!=null&&sc.si!==i)return;S.topics.forEach(function(T,j){if(sc.ti!=null&&sc.ti!==j)return;tops.push([i,j])})});
  tops.forEach(function(p){all=all.concat(pool(p[0],p[1]))});
  var sn=seen(),fresh=sh(all).filter(function(q){return sn.indexOf(q.question)<0}),res=[],used={},per=Math.ceil(n/tops.length);
  fresh=fresh.concat(sh(all));fresh.forEach(function(q){var k=q.si+"-"+q.ti,c=used[k]||0;if(res.length<n&&res.indexOf(q)<0&&!res.some(function(r){return r.question===q.question})&&(c<per||tops.length===1)){res.push(q);used[k]=c+1}});
  fresh.forEach(function(q){if(res.length<n&&!res.some(function(r){return r.question===q.question}))res.push(q)});
  mark(res.map(function(q){return q.question}));return res}
 return{pick:pick,pool:pool}})();
