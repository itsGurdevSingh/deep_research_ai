from langchain.tools import tool 
import os
import requests

from dotenv import load_dotenv
load_dotenv()

from tavily import TavilyClient
from bs4 import BeautifulSoup
from rich import print

tevily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

@tool
def web_search(query: str) -> str:
    """Perform a web search"""

    tavily_response = tevily_client.search(query=query, max_results=3, search_depth = "basic")

    results = []

    print(tavily_response)

    for result in tavily_response["results"]:
        results.append(
            f"Title: {result['title']}\n"
            f"URL: {result['url']}\n"
            f"Content: {result['content']}\n"
        )

    return "\n".join(results)


@tool
def url_scraper(url: str) -> str:
    """Scrape the content of a URL"""
    try:
        response = requests.get(url= url, timeout=8, headers= {"User-Agent": "Mozilla/5.0"})
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, "html.parser")
            for tag in soup(["script", "style", "header", "footer", "nav", "aside"]):
                tag.decompose()
            return soup.get_text(separator="\n", strip=True)[:3000]
    except Exception as e:
        return f"Error scraping the URL: {str(e)}"


print(url_scraper.invoke("https://www.nature.com/articles/s41586-020-2649-2"))


