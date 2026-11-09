(function(){
  'use strict';
  const b=document.querySelector('.menu-btn');
  const n=document.querySelector('.nav');
  if(b&&n){
    b.addEventListener('click',()=>{const on=n.classList.toggle('open');b.setAttribute('aria-expanded',String(on));b.setAttribute('aria-label',on?'메뉴 닫기':'메뉴 열기')});
    n.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{n.classList.remove('open');b.setAttribute('aria-expanded','false')}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){n.classList.remove('open');b.setAttribute('aria-expanded','false')}});
  }
  // JavaScript 없이도 본문이 모두 노출됩니다. 브라우저 지원 시에만 섹션 애니메이션 적용.
  if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections=Array.from(document.querySelectorAll('.scroll-reveal'));
  if(!sections.length)return;
  const observer=new IntersectionObserver((entries)=>{
    for(const entry of entries){
      if(entry.isIntersecting){
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('reveal-visible');
        observer.unobserve(entry.target);
      }
    }
  },{threshold:0.05,rootMargin:'0px 0px -6% 0px'});
  sections.forEach(el=>{
    // 처음부터 화면에 걸치는 섹션은 숨기지 않아 첫 화면 표시 속도를 유지합니다.
    if(el.getBoundingClientRect().top<window.innerHeight*0.90){
      el.classList.add('reveal-visible');
    }else{
      el.classList.add('reveal-pending');
      observer.observe(el);
    }
  });
})();
