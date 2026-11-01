import { createPointkit, describeElement, getSelector, type ElementContext, type Pointkit } from '../dist/index.js';
const picker:Pointkit=createPointkit({styles:false, getContext:(element,context)=>({file:element.id,selector:context.selector}),onCopy:({context,text})=>{const c:ElementContext=context;console.log(c.selector,text);}});
picker.activate();picker.deactivate();picker.destroy();
const context:ElementContext=describeElement(document.body);
const selector:string=getSelector(document.body);
void context;void selector;
import { uploadPoint, type PointReceipt } from '../dist/index.js';
const sharing=createPointkit({share:{endpoint:'https://pointkit.dev/api/points',expiresIn:3600},onUpload:(receipt:PointReceipt)=>console.log(receipt.url,receipt.delete_token)});
void sharing;void uploadPoint;

const composed=createPointkit({composer:true,capture:true,share:{endpoint:"https://pointkit.dev/api/points"}});
void composed.copy(document.body,{note:"memo",image:null});
