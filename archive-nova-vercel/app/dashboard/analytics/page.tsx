import type { Metadata } from 'next'
import { AnalyticsStudio } from '@/components/dashboard/analytics-studio'
export const metadata:Metadata={title:'Analytics',robots:{index:false,follow:false}}
export default function Page(){return <AnalyticsStudio/>}
