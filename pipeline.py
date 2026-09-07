from agents import build_serch_agent, build_url_reader_agent, writer_chain, critic_chain

def run_research_pipeline(topic: str) -> dict:

    state= {}

    # Step 1: Search for relevant information
    search_agent = build_serch_agent()
    search_response = search_agent.invoke({
        "messages": [
            ("user", f"Find recent, reliable and detailed information about: {topic}")
        ]
    })

    state["search_results"] = search_response["messages"][-1].content

    # Step 2: Scrape content from the URLs found in the search results
    url_reader_agent = build_url_reader_agent()
    scraper_response = url_reader_agent.invoke({
        "messages": [
            (
                "user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results'][:800]}"
            )
        ]
    })

    state["scraper_results"] = scraper_response["messages"][-1].content

    # Step 3: Generate a research report based on the gathered information
    report = writer_chain.invoke({
        "topic": topic,
        "research": f"{state['search_results']}\n\n{state['scraper_results']}"
    })

    state["report"] = report

    # Step 4: Critique the generated report
    critique = critic_chain.invoke({
        "report": state["report"]
    })

    state["critique"] = critique

    return state


if __name__ == "__main__":
    topic = input("Enter a research topic: ")
    research_pipeline_state = run_research_pipeline(topic)

    print("\n--- Research Pipeline State ---")
    print(f"Search Results:\n{research_pipeline_state['search_results']}\n")
    print(f"Scraper Results:\n{research_pipeline_state['scraper_results']}\n")
    print(f"Generated Report:\n{research_pipeline_state['report']}\n")
    print(f"Critique:\n{research_pipeline_state['critique']}\n")
    

