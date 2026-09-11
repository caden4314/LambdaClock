import {createSignal,For,onCleanup,onMount} from 'solid-js';

const GROUPS=['Lambda','Other'];

export default function SideMenu(props){
  const [expanded,setExpanded]=createSignal({Lambda:true,Other:true});
  const close=()=>props.onOpenChange?.(false);
  const toggle=()=>props.onOpenChange?.(!props.open);
  const toggleGroup=name=>setExpanded(current=>({...current,[name]:!current[name]}));
  const groupItems=name=>(props.items||[]).filter(item=>(item.group||'Other')===name);
  function onKeyDown(event){if(event.key==='Escape'&&props.open)close()}
  onMount(()=>window.addEventListener('keydown',onKeyDown));
  onCleanup(()=>window.removeEventListener('keydown',onKeyDown));

  return <>
    <button class={`menu-trigger${props.open?' is-open':''}`} type="button" aria-label={props.open?'Close menu':'Open menu'} aria-expanded={props.open} aria-controls="side-menu" onClick={toggle}><span/><span/><span/></button>
    <button class={`menu-backdrop${props.open?' is-open':''}`} type="button" aria-label="Close menu" tabindex={props.open?0:-1} onClick={close}/>
    <aside id="side-menu" class={`side-menu${props.open?' is-open':''}`} aria-hidden={!props.open}>
      <nav class="menu-list" aria-label="Project menu">
        <For each={GROUPS}>{group=>{
          const id=`menu-group-${group.toLowerCase()}`;
          return <section class="menu-group">
            <button type="button" class="menu-item" aria-expanded={expanded()[group]} aria-controls={id} onClick={()=>toggleGroup(group)}>{expanded()[group]?'−':'+'} {group}</button>
            <div id={id} hidden={!expanded()[group]}>
              <For each={groupItems(group)}>{(item,index)=><button type="button" class={`menu-project${props.selected===item.id?' active':''}`} aria-current={props.selected===item.id?'page':undefined} onClick={()=>props.onSelect?.(item.id)}>
                <span>{String(index()+1).padStart(2,'0')}</span><div><b>{item.name}</b><small>{item.note}</small></div><i/>
              </button>}</For>
            </div>
          </section>;
        }}</For>
      </nav>
    </aside>
  </>;
}
