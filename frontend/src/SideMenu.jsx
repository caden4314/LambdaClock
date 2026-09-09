import {For,onCleanup,onMount} from 'solid-js';

export default function SideMenu(props){
  const close=()=>props.onOpenChange?.(false);
  const toggle=()=>props.onOpenChange?.(!props.open);
  function onKeyDown(event){if(event.key==='Escape'&&props.open)close()}
  onMount(()=>window.addEventListener('keydown',onKeyDown));
  onCleanup(()=>window.removeEventListener('keydown',onKeyDown));

  return <>
    <button class={`menu-trigger${props.open?' is-open':''}`} type="button" aria-label={props.open?'Close menu':'Open menu'} aria-expanded={props.open} aria-controls="side-menu" onClick={toggle}><span/><span/><span/></button>
    <button class={`menu-backdrop${props.open?' is-open':''}`} type="button" aria-label="Close menu" tabindex={props.open?0:-1} onClick={close}/>
    <aside id="side-menu" class={`side-menu${props.open?' is-open':''}`} aria-hidden={!props.open}>
      <nav class="menu-list" aria-label="Lambda project menu">
        <For each={props.items||[]}>{(item,index)=><button type="button" class={`menu-project${props.selected===item.id?' active':''}`} aria-current={props.selected===item.id?'page':undefined} onClick={()=>props.onSelect?.(item.id)}>
          <span>{String(index()+1).padStart(2,'0')}</span><div><b>{item.name}</b><small>{item.note}</small></div><i/>
        </button>}</For>
      </nav>
    </aside>
  </>;
}
