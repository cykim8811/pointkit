import { createPointkit, describeElement, getSelector, type ElementContext, type Pointkit } from '../dist/index.js';
const picker:Pointkit=createPointkit({styles:false, getContext:(element,context)=>({file:element.id,selector:context.selector}),onCopy:({context,text})=>{const c:ElementContext=context;console.log(c.selector,text);}});
picker.activate();picker.deactivate();picker.destroy();
const context:ElementContext=describeElement(document.body);
const selector:string=getSelector(document.body);
void context;void selector;
