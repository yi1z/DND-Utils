import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Typography from '@mui/material/Typography';
import CardActionArea from '@mui/material/CardActionArea';

export default function ActionAreaCard() {
  return (
    <div className='flex flex-col items-center justify-center h-dvh'>
        <div className='flex gap-12'>
            <div className='col-1'>
                <Card sx={{ maxWidth: 345 }}>
                    <CardActionArea>
                        <CardMedia
                        component="img"
                        height="140"
                        image="/test1.jpg"
                        alt="green iguana"
                        />
                        <CardContent>
                        <Typography gutterBottom variant="h5" component="div" className='text-center'>
                            创建角色
                        </Typography>
                        </CardContent>
                    </CardActionArea>
                </Card>
            </div>
            
            <div className='col-1'>
                <Card sx={{ maxWidth: 345 }}>
                    <CardActionArea>
                        <CardMedia
                        component="img"
                        height="140"
                        image="/test2.jpg"
                        alt="green iguana"
                        />
                        <CardContent>
                        <Typography gutterBottom variant="h5" component="div" className='text-center'>
                            编辑角色
                        </Typography>
                        </CardContent>
                    </CardActionArea>
                </Card>
            </div>
            
            <div className='col-1'>
                <Card sx={{ maxWidth: 345 }}>
                    <CardActionArea>
                        <CardMedia
                        component="img"
                        height="140"
                        image="/test3.jpg"
                        alt="green iguana"
                        />
                        <CardContent>
                        <Typography gutterBottom variant="h5" component="div" className='text-center'>
                            加入游戏
                        </Typography>
                        </CardContent>
                    </CardActionArea>
                </Card>
            </div>

        </div>
    </div>
  );
}