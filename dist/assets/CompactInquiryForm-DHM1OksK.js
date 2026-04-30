import{r as c,j as e,u as P,s as E,X as L}from"./index-DtLQWHN6.js";import A from"./purify.es-B6FQ9oRL.js";import{S as R}from"./search-B7cKSbSK.js";import{P as T}from"./plus-D7KWGFe1.js";function M({htmlContent:i,className:j=""}){const s=c.useRef(null),[C,u]=c.useState(500),[_,F]=c.useState({});return c.useEffect(()=>{var o;if(!s.current||!i)return;const n=s.current;let h=(t=>{const l=document.createElement("textarea");return l.innerHTML=t,l.value})(i);h=h.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,(t,l,d)=>{const p=Math.random().toString(36).substr(2,9);return`<div class="quoted-section" data-quote-id="${p}">
          <div class="quoted-toggle" onclick="toggleQuote('${p}')">
            <span class="toggle-icon">...</span>
          </div>
          <blockquote class="quoted-content" id="quote-${p}" style="display: none;">${l}</blockquote>
        </div>`});const k=`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          
      <style>
        * {
          box-sizing: border-box;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #202124;
          margin: 0;
          padding: 16px;
          background: white;
          overflow-x: hidden;
          word-wrap: break-word;
        }

        /* Table styling - Gmail style */
        table {
          border-collapse: collapse !important;
          width: auto !important;
          max-width: 100%;
          margin: 12px 0;
          font-size: 13px;
        }

        table, th, td {
          border: 1px solid #000 !important;
        }

        th, td {
          padding: 6px 10px !important;
          text-align: left;
          vertical-align: top;
          word-break: break-word;
        }

        th {
          font-weight: 700 !important;
        }

        /* Preserve inline styles and colors */
        th[bgcolor], td[bgcolor] {
          /* Browser will apply bgcolor attribute */
        }

        /* Common email table colors */
        [bgcolor="#FFFF00"], [bgcolor="yellow"], [style*="background:yellow"], [style*="background-color:yellow"] {
          background-color: #FFFF00 !important;
        }

        [bgcolor="#E6E6FA"], [bgcolor="lavender"], [style*="background:lavender"], [style*="background-color:lavender"] {
          background-color: #E6E6FA !important;
        }

        [style*="color:blue"], [style*="color:#0000FF"] {
          color: #0000FF !important;
        }

        [style*="color:darkblue"], [style*="color:#00008B"] {
          color: #00008B !important;
        }

        /* Typography */
        p {
          margin: 8px 0;
        }

        a {
          color: #1a73e8;
          text-decoration: none;
        }

        a:hover {
          text-decoration: underline;
        }

        strong, b {
          font-weight: 700;
        }

        em, i {
          font-style: italic;
        }

        /* Lists */
        ul, ol {
          margin: 8px 0;
          padding-left: 24px;
        }

        li {
          margin: 4px 0;
        }

        /* Blockquotes */
        blockquote {
          margin: 8px 0;
          padding-left: 16px;
          border-left: 4px solid #ccc;
          color: #666;
        }

        /* Quoted section styling */
        .quoted-section {
          margin: 12px 0;
        }

        .quoted-toggle {
          display: inline-block;
          color: #1a73e8;
          cursor: pointer;
          font-size: 13px;
          padding: 4px 8px;
          border-radius: 4px;
          user-select: none;
        }

        .quoted-toggle:hover {
          background-color: #f0f0f0;
        }

        .toggle-icon {
          display: inline-block;
          font-weight: bold;
        }

        .quoted-content {
          margin-top: 8px;
          padding-left: 16px;
          border-left: 4px solid #ccc;
          color: #666;
        }

        /* Headers */
        h1, h2, h3, h4, h5, h6 {
          margin: 12px 0 8px 0;
          font-weight: 700;
          line-height: 1.3;
        }

        /* Images */
        img {
          max-width: 100%;
          height: auto;
        }

        /* Horizontal rules */
        hr {
          border: none;
          border-top: 1px solid #dadce0;
          margin: 16px 0;
        }

        /* Prevent overflow */
        pre {
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-x: auto;
        }

        /* Center tag support */
        center {
          text-align: center;
        }
      </style>
    
          <script>
            function toggleQuote(id) {
              const content = document.getElementById('quote-' + id);
              const toggle = content.previousElementSibling.querySelector('.toggle-icon');

              if (content.style.display === 'none') {
                content.style.display = 'block';
                toggle.textContent = '▼';
              } else {
                content.style.display = 'none';
                toggle.textContent = '...';
              }
            }
          <\/script>
        </head>
        <body>
          ${A.sanitize(h,{ALLOWED_TAGS:["html","head","body","meta","title","style","p","br","div","span","a","img","strong","em","u","b","i","s","strike","h1","h2","h3","h4","h5","h6","ul","ol","li","table","thead","tbody","tfoot","tr","th","td","font","center","blockquote","pre","code","hr","sup","sub"],ALLOWED_ATTR:["style","class","id","href","target","rel","src","alt","title","width","height","align","valign","border","cellpadding","cellspacing","bgcolor","color","face","size","data-quote-id","onclick"],ALLOW_DATA_ATTR:!0,ALLOWED_URI_REGEXP:/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i})}
        </body>
      </html>
    `,b=new Blob([k],{type:"text/html; charset=UTF-8"}),g=URL.createObjectURL(b);if(n.src=g,!(n.contentDocument||((o=n.contentWindow)==null?void 0:o.document)))return;const y=()=>{var t;try{const l=n.contentDocument||((t=n.contentWindow)==null?void 0:t.document);if(!l)return;const d=()=>{const x=l.body,m=l.documentElement,S=Math.max((x==null?void 0:x.scrollHeight)||0,(x==null?void 0:x.offsetHeight)||0,(m==null?void 0:m.clientHeight)||0,(m==null?void 0:m.scrollHeight)||0,(m==null?void 0:m.offsetHeight)||0);u(Math.max(S+20,100))};d();const p=new ResizeObserver(d);l.body&&p.observe(l.body),setTimeout(d,150),n.__cleanup=()=>{p.disconnect(),URL.revokeObjectURL(g)}}catch(l){console.error("Error measuring iframe height:",l)}};return n.addEventListener("load",y),()=>{n.removeEventListener("load",y),n.__cleanup&&n.__cleanup(),URL.revokeObjectURL(g)}},[i]),!i||i.trim()===""?e.jsx("div",{className:`text-gray-500 italic p-4 ${j}`,children:"No email content available"}):e.jsx("iframe",{ref:s,title:"Email Content",className:`w-full border-0 ${j}`,style:{height:`${C}px`,minHeight:"100px",maxHeight:"800px"},sandbox:"allow-same-origin",loading:"lazy"})}function z({onSubmit:i,onCancel:j,initialData:s,isEditing:C=!1}){const{profile:u}=P(),[_,F]=c.useState([]),[n,N]=c.useState([]),[f,h]=c.useState(""),[w,v]=c.useState(!1),[k,b]=c.useState(!1),[g,q]=c.useState(!1),y=c.useRef(null),[o,t]=c.useState({product_name:(s==null?void 0:s.product_name)||"",specification:(s==null?void 0:s.specification)||"",quantity:(s==null?void 0:s.quantity)||"",priority:(s==null?void 0:s.priority)||"medium",inquiry_source:(s==null?void 0:s.inquiry_source)||"email",supplier_name:(s==null?void 0:s.supplier_name)||"",supplier_country:(s==null?void 0:s.supplier_country)||"",customer_id:(s==null?void 0:s.customer_id)||"",company_name:(s==null?void 0:s.company_name)||"",contact_person:(s==null?void 0:s.contact_person)||"",contact_email:(s==null?void 0:s.contact_email)||"",contact_phone:(s==null?void 0:s.contact_phone)||"",price_required:(s==null?void 0:s.price_required)||!1,coa_required:(s==null?void 0:s.coa_required)||!1,sample_required:(s==null?void 0:s.sample_required)||!1,agency_letter_required:(s==null?void 0:s.agency_letter_required)||!1,others_required:(s==null?void 0:s.others_required)||!1,purchase_price:(s==null?void 0:s.purchase_price)||"",purchase_price_currency:(s==null?void 0:s.purchase_price_currency)||"USD",offered_price:(s==null?void 0:s.offered_price)||"",offered_price_currency:(s==null?void 0:s.offered_price_currency)||"USD",delivery_date:(s==null?void 0:s.delivery_date)||"",delivery_terms:(s==null?void 0:s.delivery_terms)||"",aceerp_no:(s==null?void 0:s.aceerp_no)||"",mail_subject:(s==null?void 0:s.mail_subject)||"",pipeline_status:(s==null?void 0:s.pipeline_status)||"new",remarks:(s==null?void 0:s.remarks)||"",internal_notes:(s==null?void 0:s.internal_notes)||"",is_multi_product:(s==null?void 0:s.is_multi_product)||!1,products:(s==null?void 0:s.products)||[]}),[l,d]=c.useState({company_name:"",contact_person:"",email:"",phone:"",country:"Indonesia",address:"",city:"Jakarta Pusat",npwp:"",pbf_license:"",gst_vat_type:"",payment_terms:""});c.useEffect(()=>{p()},[]),c.useEffect(()=>{const r=a=>{y.current&&!y.current.contains(a.target)&&v(!1)};return w&&document.addEventListener("mousedown",r),()=>{document.removeEventListener("mousedown",r)}},[w]),c.useEffect(()=>{if(f){const r=_.filter(a=>a.company_name.toLowerCase().includes(f.toLowerCase()));N(r)}else N(_)},[f,_]);const p=async()=>{try{const{data:r,error:a}=await E.from("customers").select("id, company_name, contact_person, email, phone, country, address, city").eq("is_active",!0).order("company_name");if(a)throw a;F(r||[]),N(r||[])}catch(r){console.error("Error loading customers:",r)}},x=r=>{t({...o,customer_id:r.id,company_name:r.company_name,contact_person:r.contact_person||"",contact_email:r.email||"",contact_phone:r.phone||""}),h(r.company_name),v(!1)},m=async()=>{if(!l.company_name){alert("Customer name is required");return}try{const{data:r,error:a}=await E.from("customers").insert({...l,is_active:!0}).select().single();if(a)throw a;await p(),x(r),b(!1),d({company_name:"",contact_person:"",email:"",phone:"",country:"Indonesia",address:"",city:"Jakarta Pusat",npwp:"",pbf_license:"",gst_vat_type:"",payment_terms:""})}catch(r){console.error("Error adding customer:",r),alert("Failed to add customer")}},S=async r=>{if(r.preventDefault(),o.is_multi_product){if(!o.company_name){alert("Please fill in Customer");return}}else if(!o.product_name||!o.quantity||!o.company_name){alert("Please fill in all required fields: Product Name, Quantity, and Customer");return}q(!0);try{await i(o)}finally{q(!1)}};return e.jsxs(e.Fragment,{children:[e.jsxs("form",{onSubmit:S,className:"space-y-3",children:[e.jsxs("div",{className:"flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200",children:[e.jsx("input",{type:"checkbox",id:"multiProductToggle",checked:o.is_multi_product,onChange:r=>{const a=r.target.checked;t({...o,is_multi_product:a,products:a&&o.products.length===0?[{productName:"",specification:"",quantity:"",supplierName:"",supplierCountry:"",deliveryDate:"",deliveryTerms:""}]:o.products})},className:"w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"}),e.jsx("label",{htmlFor:"multiProductToggle",className:"text-sm font-medium text-gray-700 cursor-pointer",children:"Multi-Product Inquiry (Common data will be applied to all products)"})]}),!o.is_multi_product&&e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsxs("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:["Product Name ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{type:"text",value:o.product_name,onChange:r=>t({...o,product_name:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Enter product name",required:!0})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Specification"}),e.jsx("input",{type:"text",value:o.specification,onChange:r=>t({...o,specification:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"BP / USP / EP"})]})]}),e.jsxs("div",{className:"grid grid-cols-3 gap-3",children:[!o.is_multi_product&&e.jsxs("div",{children:[e.jsxs("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:["Quantity ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{type:"text",value:o.quantity,onChange:r=>t({...o,quantity:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"e.g., 500 KG",required:!0})]}),e.jsxs("div",{className:o.is_multi_product?"col-span-1":"",children:[e.jsxs("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:["Priority ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("select",{value:o.priority,onChange:r=>t({...o,priority:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",children:[e.jsx("option",{value:"low",children:"Low"}),e.jsx("option",{value:"medium",children:"Medium"}),e.jsx("option",{value:"high",children:"High"}),e.jsx("option",{value:"urgent",children:"Urgent"})]})]}),e.jsxs("div",{className:o.is_multi_product?"col-span-2":"",children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Inquiry Source"}),e.jsxs("select",{value:o.inquiry_source,onChange:r=>t({...o,inquiry_source:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",children:[e.jsx("option",{value:"email",children:"Email"}),e.jsx("option",{value:"phone",children:"Phone"}),e.jsx("option",{value:"whatsapp",children:"WhatsApp"}),e.jsx("option",{value:"website",children:"Website"}),e.jsx("option",{value:"referral",children:"Referral"}),e.jsx("option",{value:"other",children:"Other"})]})]})]}),e.jsxs("div",{className:"grid grid-cols-3 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Supplier Name"}),e.jsx("input",{type:"text",value:o.supplier_name,onChange:r=>t({...o,supplier_name:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Manufacturer/Supplier"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Country of Origin"}),e.jsx("input",{type:"text",value:o.supplier_country,onChange:r=>t({...o,supplier_country:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Supplier country"})]}),e.jsxs("div",{ref:y,className:"relative",children:[e.jsxs("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:["Customer ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("div",{className:"relative",children:[e.jsx("input",{type:"text",value:f||o.company_name,onChange:r=>{h(r.target.value),v(!0)},onFocus:()=>v(!0),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-8",placeholder:"Search customer...",required:!0}),e.jsx(R,{className:"absolute right-2 top-2 w-4 h-4 text-gray-400"})]}),w&&e.jsxs("div",{className:"absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto",children:[n.map(r=>e.jsxs("div",{onClick:()=>x(r),className:"px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm",children:[e.jsx("div",{className:"font-medium",children:r.company_name}),r.contact_person&&e.jsx("div",{className:"text-xs text-gray-500",children:r.contact_person})]},r.id)),n.length===0&&e.jsx("div",{className:"px-3 py-2 text-sm text-gray-500",children:"No customers found"})]}),e.jsxs("button",{type:"button",onClick:()=>b(!0),className:"mt-1 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1",children:[e.jsx(T,{className:"w-3 h-3"}),"Add New Customer"]})]})]}),e.jsxs("div",{className:"grid grid-cols-3 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Contact Person"}),e.jsx("input",{type:"text",value:o.contact_person,onChange:r=>t({...o,contact_person:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Name"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Email"}),e.jsx("input",{type:"text",value:o.contact_email,onChange:r=>t({...o,contact_email:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"email@example.com or multiple: email1@example.com, email2@example.com"}),e.jsx("p",{className:"text-xs text-gray-500 mt-0.5",children:"Use comma (,) or semicolon (;) to separate multiple emails"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Phone"}),e.jsx("input",{type:"tel",value:o.contact_phone,onChange:r=>t({...o,contact_phone:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"+62 xxx"})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Mail Subject"}),e.jsx("input",{type:"text",value:o.mail_subject,onChange:r=>t({...o,mail_subject:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Email subject line"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-2",children:"Customer Requested"}),e.jsxs("div",{className:"grid grid-cols-5 gap-3",children:[e.jsxs("label",{className:"flex items-center gap-2 cursor-pointer",children:[e.jsx("input",{type:"checkbox",checked:o.price_required,onChange:r=>t({...o,price_required:r.target.checked}),className:"w-4 h-4 rounded border-gray-300"}),e.jsx("span",{className:"text-xs text-gray-700",children:"Price"})]}),e.jsxs("label",{className:"flex items-center gap-2 cursor-pointer",children:[e.jsx("input",{type:"checkbox",checked:o.coa_required,onChange:r=>t({...o,coa_required:r.target.checked}),className:"w-4 h-4 rounded border-gray-300"}),e.jsx("span",{className:"text-xs text-gray-700",children:"COA"})]}),e.jsxs("label",{className:"flex items-center gap-2 cursor-pointer",children:[e.jsx("input",{type:"checkbox",checked:o.sample_required,onChange:r=>t({...o,sample_required:r.target.checked}),className:"w-4 h-4 rounded border-gray-300"}),e.jsx("span",{className:"text-xs text-gray-700",children:"Sample"})]}),e.jsxs("label",{className:"flex items-center gap-2 cursor-pointer",children:[e.jsx("input",{type:"checkbox",checked:o.agency_letter_required,onChange:r=>t({...o,agency_letter_required:r.target.checked}),className:"w-4 h-4 rounded border-gray-300"}),e.jsx("span",{className:"text-xs text-gray-700",children:"Agency Letter"})]}),e.jsxs("label",{className:"flex items-center gap-2 cursor-pointer",children:[e.jsx("input",{type:"checkbox",checked:o.others_required,onChange:r=>t({...o,others_required:r.target.checked}),className:"w-4 h-4 rounded border-gray-300"}),e.jsx("span",{className:"text-xs text-gray-700",children:"Others"})]})]})]}),e.jsxs("div",{className:"border-t border-gray-200 pt-3",children:[e.jsx("h3",{className:"text-xs font-semibold text-gray-700 mb-2",children:"Pricing"}),e.jsxs("div",{className:"grid grid-cols-6 gap-2",children:[(u==null?void 0:u.role)==="admin"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"col-span-2",children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Purchase Price"}),e.jsx("input",{type:"text",value:o.purchase_price,onChange:r=>t({...o,purchase_price:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"100.00"})]}),e.jsxs("div",{className:"col-span-1",children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Currency"}),e.jsxs("select",{value:o.purchase_price_currency,onChange:r=>t({...o,purchase_price_currency:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",children:[e.jsx("option",{value:"USD",children:"USD"}),e.jsx("option",{value:"IDR",children:"IDR"})]})]})]}),e.jsxs("div",{className:(u==null?void 0:u.role)==="admin"?"col-span-2":"col-span-4",children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Offered Price"}),e.jsx("input",{type:"text",value:o.offered_price,onChange:r=>t({...o,offered_price:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"150.00"})]}),e.jsxs("div",{className:(u==null?void 0:u.role)==="admin"?"col-span-1":"col-span-2",children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Currency"}),e.jsxs("select",{value:o.offered_price_currency,onChange:r=>t({...o,offered_price_currency:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",children:[e.jsx("option",{value:"USD",children:"USD"}),e.jsx("option",{value:"IDR",children:"IDR"})]})]})]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Delivery Date"}),e.jsx("input",{type:"date",value:o.delivery_date,onChange:r=>t({...o,delivery_date:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Delivery Terms"}),e.jsxs("select",{value:o.delivery_terms,onChange:r=>t({...o,delivery_terms:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",children:[e.jsx("option",{value:"",children:"Select..."}),e.jsx("option",{value:"FOB Jakarta",children:"FOB Jakarta"}),e.jsx("option",{value:"CIF Jakarta",children:"CIF Jakarta"}),e.jsx("option",{value:"FOB Surabaya",children:"FOB Surabaya"}),e.jsx("option",{value:"CIF Surabaya",children:"CIF Surabaya"}),e.jsx("option",{value:"FOB Semarang",children:"FOB Semarang"}),e.jsx("option",{value:"CIF Semarang",children:"CIF Semarang"}),e.jsx("option",{value:"EXW",children:"EXW"}),e.jsx("option",{value:"DDP",children:"DDP"}),e.jsx("option",{value:"DAP",children:"DAP"}),e.jsx("option",{value:"CFR",children:"CFR"}),e.jsx("option",{value:"FCA",children:"FCA"})]})]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"ACE ERP No"}),e.jsx("input",{type:"text",value:o.aceerp_no,onChange:r=>t({...o,aceerp_no:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Optional"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Pipeline Status"}),e.jsxs("select",{value:o.pipeline_status,onChange:r=>t({...o,pipeline_status:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",children:[e.jsx("option",{value:"new",children:"New"}),e.jsx("option",{value:"in_progress",children:"In Progress"}),e.jsx("option",{value:"follow_up",children:"Follow Up"}),e.jsx("option",{value:"won",children:"Won"}),e.jsx("option",{value:"lost",children:"Lost"}),e.jsx("option",{value:"on_hold",children:"On Hold"})]})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Remarks"}),e.jsx("textarea",{value:o.remarks,onChange:r=>t({...o,remarks:r.target.value}),rows:2,className:"w-full px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Customer notes, special requirements..."})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Internal Notes"}),e.jsx("textarea",{value:o.internal_notes,onChange:r=>t({...o,internal_notes:r.target.value}),rows:2,className:"w-full px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Private notes (not visible to customer)..."})]}),e.jsxs("div",{className:"flex justify-end gap-3 pt-3 border-t border-gray-200 sticky bottom-0 bg-white",children:[e.jsx("button",{type:"button",onClick:j,className:"px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition",disabled:g,children:"Cancel"}),e.jsx("button",{type:"submit",className:"px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50",disabled:g,children:g?"Saving...":C?"Update Inquiry":"Add Inquiry"})]})]}),k&&e.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",children:"Add New Customer"}),e.jsx("button",{onClick:()=>b(!1),className:"text-gray-400 hover:text-gray-600",children:e.jsx(L,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{children:[e.jsxs("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:["Company Name ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{type:"text",value:l.company_name,onChange:r=>d({...l,company_name:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Company name"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Contact Person"}),e.jsx("input",{type:"text",value:l.contact_person,onChange:r=>d({...l,contact_person:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Contact name"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Email"}),e.jsx("input",{type:"text",value:l.email,onChange:r=>d({...l,email:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"email@example.com"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Phone"}),e.jsx("input",{type:"tel",value:l.phone,onChange:r=>d({...l,phone:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"+62 xxx"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Country"}),e.jsx("input",{type:"text",value:l.country,onChange:r=>d({...l,country:r.target.value}),className:"w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Indonesia"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs font-medium text-gray-700 mb-1",children:"Address"}),e.jsx("textarea",{value:l.address,onChange:r=>d({...l,address:r.target.value}),rows:2,className:"w-full px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500",placeholder:"Full address"})]})]}),e.jsxs("div",{className:"flex justify-end gap-3 mt-4",children:[e.jsx("button",{onClick:()=>b(!1),className:"px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition",children:"Cancel"}),e.jsx("button",{onClick:m,className:"px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition",children:"Add Customer"})]})]})})]})}export{z as C,M as E};
