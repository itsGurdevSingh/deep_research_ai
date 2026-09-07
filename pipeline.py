from agents import build_serch_agent, build_url_reader_agent, writer_chain, critic_chain


class ResearchPipelineError(RuntimeError):
    """An expected failure with a message safe to return from the API."""

    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


def _run_stage(stage: str, operation):
    try:
        return operation()
    except ResearchPipelineError:
        raise
    except TimeoutError as error:
        raise ResearchPipelineError(
            f"{stage}_timeout",
            f"The {stage} step took too long. Please try again.",
            retryable=True,
        ) from error
    except Exception as error:
        error_text = str(error).lower()
        if stage == "search" and any(
            phrase in error_text for phrase in ("tavily", "search provider")
        ):
            raise ResearchPipelineError(
                "search_provider_error",
                "The web search provider is temporarily unavailable. Please try again shortly.",
                retryable=True,
            ) from error
        if any(
            phrase in error_text
            for phrase in ("token", "context length", "too many tokens", "maximum context")
        ):
            raise ResearchPipelineError(
                "llm_token_limit",
                "The research request is too large for the language model. Please try a shorter topic.",
                retryable=False,
            ) from error
        if any(
            phrase in error_text
            for phrase in ("api key", "authentication", "unauthorized", "401", "403")
        ):
            raise ResearchPipelineError(
                "provider_configuration_error",
                "A research provider is not configured correctly. Please check the server configuration.",
                retryable=False,
            ) from error
        if any(
            phrase in error_text
            for phrase in ("rate limit", "too many requests", "429")
        ):
            raise ResearchPipelineError(
                "provider_rate_limit",
                "A research provider is temporarily rate-limiting requests. Please try again shortly.",
                retryable=True,
            ) from error
        raise ResearchPipelineError(
            f"{stage}_error",
            f"The {stage} step could not be completed. Please try again.",
            retryable=True,
        ) from error


def run_research_pipeline(topic: str) -> dict:
    topic = topic.strip()
    if not topic:
        raise ResearchPipelineError(
            "invalid_topic", "Please provide a research topic.", retryable=False
        )

    state = {}

    # Step 1: Search for relevant information
    search_agent = build_serch_agent()
    search_response = _run_stage(
        "search",
        lambda: search_agent.invoke({
            "messages": [
                ("user", f"Find recent, reliable and detailed information about: {topic}")
            ]
        }),
    )

    state["search_results"] = search_response["messages"][-1].content

    # Step 2: Scrape content from the URLs found in the search results
    url_reader_agent = build_url_reader_agent()
    scraper_response = _run_stage(
        "scraping",
        lambda: url_reader_agent.invoke({
            "messages": [
                (
                    "user",
                    f"Based on the following search results about '{topic}', "
                    f"pick the most relevant URL and scrape it for deeper content.\n\n"
                    f"Search Results:\n{state['search_results'][:800]}"
                )
            ]
        }),
    )

    state["scraper_results"] = scraper_response["messages"][-1].content

    # Step 3: Generate a research report based on the gathered information
    report = _run_stage(
        "report generation",
        lambda: writer_chain.invoke({
            "topic": topic,
            "research": f"{state['search_results']}\n\n{state['scraper_results']}"
        }),
    )

    state["report"] = report

    # Step 4: Critique the generated report
    critique = _run_stage(
        "report review",
        lambda: critic_chain.invoke({"report": state["report"]}),
    )

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
    

