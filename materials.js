const filters=document.querySelectorAll('.filter');const cards=document.querySelectorAll('.material-card');
function applyFilter(v){cards.forEach(c=>{c.style.display=(v==='all'||c.dataset.class===v)?'flex':'none'});filters.forEach(b=>b.classList.toggle('active',b.dataset.class===v));}
filters.forEach(b=>b.addEventListener('click',()=>applyFilter(b.dataset.class)));
const type=new URLSearchParams(location.search).get('type');
if(type){cards.forEach(c=>{c.style.display=(!type||c.dataset.type===type)?'flex':'none'});}
