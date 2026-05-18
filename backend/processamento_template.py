from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

DIR = Path(__file__).resolve().parent 

def processar_template(doc_content:list[dict], processed_path):
    env = Environment(loader=FileSystemLoader(DIR / "templates"))
    template = env.get_template("template_teste.jinja2")
    html = template.render(paginas=doc_content)

    #para teste apenas
    with open("saida_teste.html", "w", encoding="utf-8") as f:
        f.write(html)

    HTML(string=html).write_pdf(target=processed_path)