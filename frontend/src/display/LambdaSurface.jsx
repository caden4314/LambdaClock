import LambdaDisplay from '../LambdaDisplay.jsx';

function idleTransition(digits=[]){return {seq:0,changed:[],delays:{},special:null,reduction:false,previousDigits:[...digits],nextDigits:[...digits],previousDisplay:digits.map(String),nextDisplay:digits.map(String),periodChanged:false}}

export default function LambdaSurface(props){
  const digits=()=>props.digits??[];
  return <div class={`display-lambda-surface${props.class?` ${props.class}`:''}`}>
    <LambdaDisplay root={props.root} digits={digits()} period={props.period} transition={props.transition??idleTransition(digits())}/>
  </div>;
}
