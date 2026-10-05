import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import 'github-markdown-css/github-markdown.css'
import styles from './Markdown.module.css'

// Sanitising runs before highlighting, so that the highlight classes are added
// to markup that is already safe. It also drops HTML comments.
const rehypePlugins = [rehypeRaw, rehypeSanitize, rehypeHighlight]
const remarkPlugins = [remarkGfm]

interface Props {
  children: string
}

/** Renders markdown the way GitHub does: GFM syntax, safe inline HTML, GitHub styles. */
export default function Markdown({ children }: Props): JSX.Element {
  return (
    <div className={`markdown-body ${styles.root}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
