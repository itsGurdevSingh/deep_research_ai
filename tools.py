from langchain.tools import tool
import os
import requests

from dotenv import load_dotenv
load_dotenv()

from tavily import TavilyClient
from bs4 import BeautifulSoup

tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

@tool
def web_search(query: str) -> str:
    """Perform a web search"""

    tavily_response = tavily_client.search(
        query=query, max_results=3, search_depth="basic"
    )

    results = []

    for result in tavily_response["results"]:
        results.append(
            f"Title: {result['title']}\n"
            f"URL: {result['url']}\n"
            f"Content: {result['content']}\n"
        )

    return "\n".join(results)


@tool
def url_scraper(url: str) -> str:
    """Scrape the content from a URL"""
    try:
        response = requests.get(
            url=url, timeout=8, headers={"User-Agent": "Mozilla/5.0"}
        )
        response.raise_for_status()
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, "html.parser")
            for tag in soup(["script", "style", "header", "footer", "nav", "aside"]):
                tag.decompose()
            return soup.get_text(separator="\n", strip=True)[:3000]
    except requests.Timeout as error:
        return f"The URL could not be loaded because it timed out: {error}"
    except requests.RequestException as error:
        return f"The URL could not be loaded: {error}"


