(function(){
  let session = JSON.parse(localStorage.getItem('__fakesess')||'null');
  const listeners=[];
  const api=(path,body)=>fetch('/__db/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(r=>r.json());
  function q(table){
    const st={filters:[], op:'select', payload:null, single:false, ord:null, lim:null};
    const b={ select(){ return b; }, order(f,o){ st.ord=[f,o&&o.ascending===false]; return b; }, limit(n){ st.lim=n; return b; },
      eq(f,v){ st.filters.push(r=>r[f]===v); return b; }, in(f,vs){ st.filters.push(r=>vs.includes(r[f])); return b; },
      insert(o){ st.op='insert'; st.payload=o; return b; }, delete(){ st.op='delete'; return b; }, single(){ st.single=true; return b; },
      then(res,rej){ run().then(res,rej); } };
    async function run(){
      const uid=session&&session.user.id; if(!uid) return {data:null,error:{message:'not authenticated'}};
      if (st.op==='insert'){ if(table==='posts') return {data:null,error:{message:'new row violates row-level security policy'}};
        const row=await api(table,{op:'insert',row:{user_id:uid,...st.payload}}); return {data: st.single?{id:row.id}:[row], error:null}; }
      let rows=(await api(table)).filter(r=>st.filters.every(f=>f(r)));
      if (table==='recipes') rows=rows.filter(r=>r.user_id===uid);
      if (st.op==='delete'){ await api(table,{op:'delete',ids:rows.map(r=>r.id||r.post_id+'|'+r.user_id)}); return {data:null,error:null}; }
      if (st.ord){ const [f,desc]=st.ord; rows=rows.slice().sort((a,b)=>(a[f]<b[f]?-1:1)*(desc?-1:1)); }
      if (st.lim) rows=rows.slice(0,st.lim);
      if (table==='posts'){ const pf=await api('profiles'), lk=await api('likes'); rows=rows.map(r=>({...r, author:pf.find(p=>p.id===r.user_id)||null, likes:[{count:lk.filter(l=>l.post_id===r.id).length}]})); }
      return {data: st.single?(rows[0]||null):rows, error:null};
    }
    return b;
  }
  window.supabase={ createClient(){ return {
    auth:{ async getSession(){ return {data:{session}}; },
      onAuthStateChange(cb){ listeners.push(cb); return {data:{subscription:{unsubscribe(){}}}}; },
      async signInWithOAuth(){ const id='u'+Math.random().toString(36).slice(2,8);
        session={access_token:'tok-'+id, user:{id, email:'kim@example.com', user_metadata:{full_name:'김영석', avatar_url:''}}};
        await api('profiles',{op:'insert',row:{id,name:'김영석',avatar:null,setup_done:false,avatar_flagged:false}});
        localStorage.setItem('__fakesess', JSON.stringify(session)); listeners.forEach(cb=>cb('SIGNED_IN',session)); return {error:null}; },
      async signOut(){ session=null; localStorage.removeItem('__fakesess'); listeners.forEach(cb=>cb('SIGNED_OUT',null)); return {error:null}; } },
    from:q,
    storage:{ from(){ return { getPublicUrl(p){ return {data:{publicUrl:'/__photo/'+p}}; }, async remove(){ return {error:null}; } }; } }
  }; } };
})();
